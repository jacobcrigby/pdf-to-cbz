// SPDX-License-Identifier: AGPL-3.0-or-later

// Decides, for a page already classified as a single full-page image, whether its
// embedded image can be carried into the archive without a lossy re-render:
//   - passthrough: copy the original encoded bytes verbatim (JPEG/DCTDecode)
//   - lossless:    rasterize but encode PNG, so a lossless source stays lossless
//   - render:      fall back to the default lossy render (WebP/JPEG)
// Kept free of pdf.js/pdf-lib specifics so the decision is unit-testable in isolation.

/** The effective image codec — the last (image-producing) filter in the stream's chain. */
export type ImageCodec =
  | 'jpeg' // DCTDecode
  | 'jpeg2000' // JPXDecode
  | 'ccitt' // CCITTFaxDecode
  | 'jbig2' // JBIG2Decode
  | 'flate' // FlateDecode
  | 'lzw' // LZWDecode
  | 'runlength' // RunLengthDecode
  | 'raw' // no filter
  | 'other';

/** A normalized colorspace family; only RGB and grayscale are safe to pass through as JPEG. */
export type ColorspaceKind = 'rgb' | 'gray' | 'cmyk' | 'indexed' | 'other';

/** A neutral description of a page's single image, free of any PDF-library types. */
export interface ImageDescriptor {
  readonly codec: ImageCodec;
  /** True when the stream has exactly one filter, so its raw bytes are the codec's bytes. */
  readonly singleFilter: boolean;
  readonly colorspace: ColorspaceKind;
  readonly bitsPerComponent: number;
  /** A soft mask (`/SMask`) means transparency that a bare JPEG cannot carry. */
  readonly hasSoftMask: boolean;
  /** A color-key mask (`/Mask`) likewise needs compositing. */
  readonly hasColorKeyMask: boolean;
  readonly isImageMask: boolean;
  /** A `/Decode` array that is present and not the identity inverts/remaps samples. */
  readonly invertedDecode: boolean;
  /** The placement matrix is axis-aligned and unflipped (no rotation/mirror). */
  readonly upright: boolean;
  /** Page `/Rotate`, normalized to 0/90/180/270. */
  readonly pageRotation: number;
}

export type ExtractMode = 'passthrough' | 'lossless' | 'render';

// Codecs whose decoded output is bit-exact, so re-encoding to PNG loses nothing. A
// lossy codec (JPEG, JPEG 2000) is excluded: re-encoding it to PNG only bloats it.
const LOSSLESS_CODECS: ReadonlySet<ImageCodec> = new Set<ImageCodec>([
  'ccitt',
  'jbig2',
  'flate',
  'lzw',
  'runlength',
  'raw',
]);

// A JPEG can be copied byte-for-byte only when nothing about its placement or
// packaging would change how it renders: one filter (so the raw bytes are the JPEG),
// an RGB/gray 8-bit sample model, no mask/transparency, identity decode, and an
// upright, unrotated placement.
function isPassthroughEligible(d: ImageDescriptor): boolean {
  return (
    d.codec === 'jpeg' &&
    d.singleFilter &&
    (d.colorspace === 'rgb' || d.colorspace === 'gray') &&
    d.bitsPerComponent === 8 &&
    !d.hasSoftMask &&
    !d.hasColorKeyMask &&
    !d.isImageMask &&
    !d.invertedDecode &&
    d.upright &&
    d.pageRotation === 0
  );
}

/**
 * Pick how to emit a single full-page image. Passthrough is preferred (zero re-encode,
 * full original resolution); otherwise a losslessly-encoded source is rasterized to PNG
 * so it stays crisp; everything else renders with the default lossy encoder.
 */
export function decideExtract(d: ImageDescriptor): ExtractMode {
  if (isPassthroughEligible(d)) {
    return 'passthrough';
  }
  if (LOSSLESS_CODECS.has(d.codec)) {
    return 'lossless';
  }
  return 'render';
}
