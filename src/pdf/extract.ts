// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  PDFArray,
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFStream,
  type PDFObject,
  type PDFPage,
} from 'pdf-lib';
import type { ColorspaceKind, ImageCodec, ImageDescriptor } from '../core/extract-policy';

// pdf.js renders pages but never hands back a page image's original encoded bytes, so
// this module parses the PDF structure independently (pdf-lib) to recover them. For a
// page known to be a single full-page image, it locates that image's XObject and
// describes it neutrally for `core/extract-policy.ts`.

export interface ExtractedImage {
  readonly descriptor: ImageDescriptor;
  /** The stream's raw stored bytes — the codec's own bytes when there is a single filter. */
  readonly rawBytes: Uint8Array;
}

export interface ImageExtractor {
  /**
   * Locate the single image painted on `pageIndex`. `widthPx`×`heightPx` (from pdf.js)
   * disambiguates a page that references several images; `upright` is its placement
   * orientation. Returns undefined when no unique image matches, so the caller renders.
   */
  find(
    pageIndex: number,
    widthPx: number,
    heightPx: number,
    upright: boolean,
  ): ExtractedImage | undefined;
}

// One level of Form XObject nesting is followed; deeper nesting is rare for a plain
// full-page image and not worth the parse, so such pages fall back to rendering.
const MAX_FORM_DEPTH = 1;

const FILTER_CODECS: ReadonlyMap<string, ImageCodec> = new Map<string, ImageCodec>([
  ['DCTDecode', 'jpeg'],
  ['JPXDecode', 'jpeg2000'],
  ['CCITTFaxDecode', 'ccitt'],
  ['JBIG2Decode', 'jbig2'],
  ['FlateDecode', 'flate'],
  ['LZWDecode', 'lzw'],
  ['RunLengthDecode', 'runlength'],
]);

/** Parse `bytes` once so pages can be queried for their image XObjects on demand. */
export async function createImageExtractor(bytes: Uint8Array): Promise<ImageExtractor> {
  const doc = await PDFDocument.load(bytes, {
    updateMetadata: false,
    throwOnInvalidObject: false,
  });
  const pages = doc.getPages();
  return {
    find(pageIndex, widthPx, heightPx, upright) {
      const page = pages[pageIndex];
      if (!page) {
        return undefined;
      }
      const resources = page.node.Resources();
      if (!resources) {
        return undefined;
      }
      const images: PDFRawStream[] = [];
      collectImages(resources, images, 0);
      const stream = pickMatch(images, widthPx, heightPx);
      if (!stream) {
        return undefined;
      }
      return {
        descriptor: describe(stream.dict, upright, pageRotation(page)),
        rawBytes: stream.contents,
      };
    },
  };
}

// Gather every Image XObject reachable from a resources dict, descending one level into
// Form XObjects. Only raw streams are usable (their stored bytes are what we may copy).
function collectImages(resources: PDFDict, out: PDFRawStream[], depth: number): void {
  const xobjects = resources.lookupMaybe(PDFName.of('XObject'), PDFDict);
  if (!xobjects) {
    return;
  }
  for (const [, value] of xobjects.entries()) {
    const stream = derefStream(resources, value);
    if (!(stream instanceof PDFRawStream)) {
      continue;
    }
    const subtype = stream.dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString();
    if (subtype === '/Image') {
      out.push(stream);
    } else if (subtype === '/Form' && depth < MAX_FORM_DEPTH) {
      const formResources = stream.dict.lookupMaybe(PDFName.of('Resources'), PDFDict);
      if (formResources) {
        collectImages(formResources, out, depth + 1);
      }
    }
  }
}

// `entries()` yields possibly-indirect values; resolve one to a stream via the dict's
// own context (which dereferences indirect references).
function derefStream(owner: PDFDict, value: PDFObject): PDFStream | undefined {
  const resolved = value instanceof PDFStream ? value : owner.context.lookupMaybe(value, PDFStream);
  return resolved ?? undefined;
}

// Prefer the unique image whose pixel size matches what pdf.js painted; if a page has a
// single image its size need not be re-checked. Anything ambiguous returns undefined.
function pickMatch(
  images: readonly PDFRawStream[],
  widthPx: number,
  heightPx: number,
): PDFRawStream | undefined {
  const matches = images.filter(
    (s) => intEntry(s.dict, 'Width') === widthPx && intEntry(s.dict, 'Height') === heightPx,
  );
  if (matches.length === 1) {
    return matches[0];
  }
  return images.length === 1 ? images[0] : undefined;
}

function describe(dict: PDFDict, upright: boolean, pageRotation: number): ImageDescriptor {
  const filters = filterNames(dict);
  const lastFilter = filters[filters.length - 1];
  const codec: ImageCodec =
    lastFilter === undefined ? 'raw' : (FILTER_CODECS.get(lastFilter) ?? 'other');
  return {
    codec,
    singleFilter: filters.length <= 1,
    colorspace: colorspaceKind(dict),
    bitsPerComponent: intEntry(dict, 'BitsPerComponent') ?? 8,
    hasSoftMask: dict.has(PDFName.of('SMask')),
    hasColorKeyMask: dict.has(PDFName.of('Mask')),
    isImageMask: dict.lookupMaybe(PDFName.of('ImageMask'), PDFBool)?.asBoolean() ?? false,
    invertedDecode: hasInvertingDecode(dict),
    upright,
    pageRotation,
  };
}

// `/Filter` is a single name or an array of names; normalize to a list of bare names.
function filterNames(dict: PDFDict): string[] {
  const value = dict.lookup(PDFName.of('Filter'));
  if (value instanceof PDFName) {
    return [value.asString().replace(/^\//, '')];
  }
  if (value instanceof PDFArray) {
    return value
      .asArray()
      .map((entry) => (entry instanceof PDFName ? entry.asString().replace(/^\//, '') : ''))
      .filter((name) => name.length > 0);
  }
  return [];
}

function colorspaceKind(dict: PDFDict): ColorspaceKind {
  const value = dict.lookup(PDFName.of('ColorSpace'));
  if (value instanceof PDFName) {
    return nameColorspace(value.asString());
  }
  if (value instanceof PDFArray && value.size() > 0) {
    const head = value.lookupMaybe(0, PDFName)?.asString().replace(/^\//, '');
    if (head === undefined) {
      return 'other';
    }
    if (head === 'ICCBased') {
      const stream = value.lookupMaybe(1, PDFStream);
      const n = stream ? intEntry(stream.dict, 'N') : undefined;
      return n === 1 ? 'gray' : n === 3 ? 'rgb' : n === 4 ? 'cmyk' : 'other';
    }
    if (head === 'CalRGB') {
      return 'rgb';
    }
    if (head === 'CalGray') {
      return 'gray';
    }
    if (head === 'Indexed' || head === 'I') {
      return 'indexed';
    }
  }
  return 'other';
}

function nameColorspace(raw: string): ColorspaceKind {
  switch (raw.replace(/^\//, '')) {
    case 'DeviceRGB':
    case 'RGB':
      return 'rgb';
    case 'DeviceGray':
    case 'G':
      return 'gray';
    case 'DeviceCMYK':
    case 'CMYK':
      return 'cmyk';
    default:
      return 'other';
  }
}

// A `/Decode` array that is present and not the identity (`[0 1]` per component) remaps
// or inverts samples, so the stored bytes would not display as-is.
function hasInvertingDecode(dict: PDFDict): boolean {
  const decode = dict.lookupMaybe(PDFName.of('Decode'), PDFArray);
  if (!decode) {
    return false;
  }
  const values = decode.asArray();
  for (let i = 0; i + 1 < values.length; i += 2) {
    const lo = values[i];
    const hi = values[i + 1];
    if (
      !(lo instanceof PDFNumber) ||
      !(hi instanceof PDFNumber) ||
      lo.asNumber() !== 0 ||
      hi.asNumber() !== 1
    ) {
      return true;
    }
  }
  return false;
}

function intEntry(dict: PDFDict, key: string): number | undefined {
  const value = dict.lookupMaybe(PDFName.of(key), PDFNumber);
  return value ? value.asNumber() : undefined;
}

function pageRotation(page: PDFPage): number {
  return ((page.getRotation().angle % 360) + 360) % 360;
}
