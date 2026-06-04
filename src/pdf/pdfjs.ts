// SPDX-License-Identifier: AGPL-3.0-or-later
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// pdf.js needs its worker as a first-party asset (no CDN). Where a runtime can
// spawn a nested worker it does; otherwise pdf.js imports this same module on the
// current thread, so a single bundled URL covers both.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface LoadedPage {
  readonly widthPt: number;
  readonly heightPt: number;
  /** Rasterize to `canvas` at `scale`, flattening transparency onto white. */
  render(canvas: OffscreenCanvas, scale: number): Promise<void>;
}

export interface LoadedDocument {
  readonly pageCount: number;
  getPage(pageNumber: number): Promise<LoadedPage>;
}

/** Open a PDF from its bytes. Rejects on encrypted or malformed input. */
export async function loadDocument(buffer: ArrayBuffer): Promise<LoadedDocument> {
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  return {
    pageCount: doc.numPages,
    async getPage(pageNumber) {
      const page = await doc.getPage(pageNumber);
      const unscaled = page.getViewport({ scale: 1 });
      return {
        widthPt: unscaled.width,
        heightPt: unscaled.height,
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
        },
      };
    },
  };
}
