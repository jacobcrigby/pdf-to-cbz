// SPDX-License-Identifier: AGPL-3.0-or-later
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { isSingleFullPageImage } from '../core/page-classifier';
import type { RawPdfMetadata } from '../core/pdf-metadata';

// pdf.js needs its worker as a first-party asset (no CDN). Where a runtime can
// spawn a nested worker it does; otherwise pdf.js imports this same module on the
// current thread, so a single bundled URL covers both.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface CanvasAndContext {
  canvas: OffscreenCanvas | null;
  context: OffscreenCanvasRenderingContext2D | null;
}

// pdf.js allocates intermediate canvases for soft masks, transparency groups,
// patterns, and type3 glyphs. Its default factory calls document.createElement,
// which a worker has no document for, so back those canvases with OffscreenCanvas.
class OffscreenCanvasFactory {
  create(width: number, height: number): CanvasAndContext {
    if (width <= 0 || height <= 0) {
      throw new Error('Invalid canvas size');
    }
    const canvas = new OffscreenCanvas(width, height);
    return { canvas, context: canvas.getContext('2d', { willReadFrequently: true }) };
  }

  reset(target: CanvasAndContext, width: number, height: number): void {
    if (!target.canvas) {
      throw new Error('Canvas is not specified');
    }
    target.canvas.width = width;
    target.canvas.height = height;
  }

  destroy(target: CanvasAndContext): void {
    if (target.canvas) {
      target.canvas.width = 0;
      target.canvas.height = 0;
    }
    target.canvas = null;
    target.context = null;
  }
}

// The default filter factory builds SVG filters through document; a worker has
// none, so report "no filter" for every operation rather than touching the DOM.
class NoFilterFactory {
  addFilter(): string {
    return 'none';
  }
  addHCMFilter(): string {
    return 'none';
  }
  addAlphaFilter(): string {
    return 'none';
  }
  addLuminosityFilter(): string {
    return 'none';
  }
  addKnockoutFilter(): string {
    return 'none';
  }
  addHighlightHCMFilter(): string {
    return 'none';
  }
  createSelectionStyle(): null {
    return null;
  }
  destroy(): void {
    // No SVG filters are created, so there is nothing to release.
  }
}

export interface PageAnalysis {
  readonly singleFullPageImage: boolean;
  readonly imageLongEdgePx?: number;
  /** Pixel dimensions of the single painted image, for matching the source XObject. */
  readonly imageWidthPx?: number;
  readonly imageHeightPx?: number;
  /** The image's placement matrix is axis-aligned and unflipped (no rotation/mirror). */
  readonly imageUpright?: boolean;
}

export interface LoadedPage {
  readonly widthPt: number;
  readonly heightPt: number;
  /** Inspect the drawing operators to classify the page (single image vs mixed). */
  analyze(): Promise<PageAnalysis>;
  /** Rasterize to `canvas` at `scale`, flattening transparency onto white. */
  render(canvas: OffscreenCanvas, scale: number): Promise<void>;
}

const { OPS } = pdfjsLib;

// A single full-page image paints exactly one of these and nothing else.
const IMAGE_PAINT_OPS = new Set<number>([OPS.paintImageXObject, OPS.paintInlineImageXObject]);

// The 2×2 linear part [a, b, c, d] of a placement matrix; translation is irrelevant to
// whether the image is rotated or flipped, so it is dropped.
type Linear = readonly [number, number, number, number];
const IDENTITY: Linear = [1, 0, 0, 1];

// Concatenate matrix `m` onto the current `ctm` (PDF `cm` semantics), linear part only.
function concat(m: Linear, ctm: Linear): Linear {
  const [a1, b1, c1, d1] = m;
  const [a2, b2, c2, d2] = ctm;
  return [a1 * a2 + b1 * c2, a1 * b2 + b1 * d2, c1 * a2 + d1 * c2, c1 * b2 + d1 * d2];
}

// Upright means axis-aligned with positive scale: no rotation (b, c ≈ 0) and no mirror
// (a, d > 0). Such a placement maps the image onto the page without reorienting it, so
// its original bytes can be passed through unchanged.
function isUpright([a, b, c, d]: Linear): boolean {
  const eps = 1e-4 * Math.max(Math.abs(a), Math.abs(d), 1);
  return a > 0 && d > 0 && Math.abs(b) <= eps && Math.abs(c) <= eps;
}

// Text, path, and mask/repeat-image operators mean the page is more than a plain image.
const DISQUALIFYING_OPS = new Set<number>([
  OPS.showText,
  OPS.showSpacedText,
  OPS.nextLineShowText,
  OPS.nextLineSetSpacingShowText,
  OPS.stroke,
  OPS.closeStroke,
  OPS.fill,
  OPS.eoFill,
  OPS.fillStroke,
  OPS.eoFillStroke,
  OPS.closeFillStroke,
  OPS.closeEOFillStroke,
  OPS.paintImageMaskXObject,
  OPS.paintImageMaskXObjectGroup,
  OPS.paintImageMaskXObjectRepeat,
  OPS.paintInlineImageXObjectGroup,
  OPS.paintImageXObjectRepeat,
  OPS.paintSolidColorImageMask,
]);

export interface LoadedDocument {
  readonly pageCount: number;
  getPage(pageNumber: number): Promise<LoadedPage>;
  getMetadata(): Promise<RawPdfMetadata>;
}

// PDF info values are typed as `unknown`; keep only non-empty strings.
function str(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** Open a PDF from its bytes. Rejects on encrypted or malformed input. */
export async function loadDocument(buffer: ArrayBuffer): Promise<LoadedDocument> {
  const doc = await pdfjsLib.getDocument({
    data: buffer,
    CanvasFactory: OffscreenCanvasFactory,
    FilterFactory: NoFilterFactory,
    isOffscreenCanvasSupported: true,
  }).promise;
  return {
    pageCount: doc.numPages,
    async getMetadata() {
      const { info, metadata } = await doc.getMetadata();
      const fields = info as Record<string, unknown>;
      return {
        title: str(fields.Title),
        author: str(fields.Author),
        subject: str(fields.Subject),
        creationDate: str(fields.CreationDate),
        language: str(fields.Language) ?? str(metadata?.get('dc:language')),
      };
    },
    async getPage(pageNumber) {
      const page = await doc.getPage(pageNumber);
      const unscaled = page.getViewport({ scale: 1 });
      return {
        widthPt: unscaled.width,
        heightPt: unscaled.height,
        async analyze() {
          const { fnArray, argsArray } = await page.getOperatorList();
          let imagePaintCount = 0;
          let disqualifyingOpCount = 0;
          let imageWidthPx: number | undefined;
          let imageHeightPx: number | undefined;
          let imageUpright: boolean | undefined;
          // Track the current transform (with a save/restore stack) so the matrix in
          // effect when the image is painted can be checked for rotation or mirroring.
          let ctm: Linear = IDENTITY;
          const stack: Linear[] = [];
          for (let i = 0; i < fnArray.length; i += 1) {
            const fn = fnArray[i];
            if (fn === undefined) {
              continue;
            }
            if (fn === OPS.save) {
              stack.push(ctm);
            } else if (fn === OPS.restore) {
              ctm = stack.pop() ?? IDENTITY;
            } else if (fn === OPS.transform) {
              const args: unknown = argsArray[i];
              if (Array.isArray(args) && args.length >= 4) {
                ctm = concat([args[0], args[1], args[2], args[3]] as Linear, ctm);
              }
            } else if (IMAGE_PAINT_OPS.has(fn)) {
              imagePaintCount += 1;
              // paintImageXObject args are [objId, widthPx, heightPx].
              const args: unknown = argsArray[i];
              if (
                Array.isArray(args) &&
                typeof args[1] === 'number' &&
                typeof args[2] === 'number'
              ) {
                imageWidthPx = args[1];
                imageHeightPx = args[2];
              }
              imageUpright = isUpright(ctm);
            } else if (DISQUALIFYING_OPS.has(fn)) {
              disqualifyingOpCount += 1;
            }
          }
          const singleFullPageImage = isSingleFullPageImage({
            imagePaintCount,
            disqualifyingOpCount,
          });
          if (!singleFullPageImage || imageWidthPx === undefined || imageHeightPx === undefined) {
            return { singleFullPageImage };
          }
          return {
            singleFullPageImage,
            imageLongEdgePx: Math.max(imageWidthPx, imageHeightPx),
            imageWidthPx,
            imageHeightPx,
            imageUpright: imageUpright ?? false,
          };
        },
        async render(canvas, scale) {
          const viewport = page.getViewport({ scale });
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext('2d');
          if (!context) {
            throw new Error('Could not get a 2D drawing context.');
          }
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({
            canvas: null,
            canvasContext: context as unknown as CanvasRenderingContext2D,
            viewport,
          }).promise;
          // Release the page's decoded images and operator list so memory does
          // not grow across a long document.
          page.cleanup();
        },
      };
    },
  };
}
