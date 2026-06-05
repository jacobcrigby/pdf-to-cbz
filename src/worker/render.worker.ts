// SPDX-License-Identifier: AGPL-3.0-or-later
import { decideExtract } from '../core/extract-policy';
import type { PageExt } from '../core/naming';
import { describePdfError, errorMessage } from '../core/pdf-errors';
import { ENCODE_QUALITY, EXTRACT_MAX_LONG_EDGE_PX } from '../core/render-config';
import { chooseScale } from '../core/scale';
import type { RenderRequest, RenderResponse } from '../core/types';
import { createImageExtractor, type ImageExtractor } from '../pdf/extract';
import {
  loadDocument,
  type LoadedDocument,
  type LoadedPage,
  type PageAnalysis,
} from '../pdf/pdfjs';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// One render worker owns one pdf.js document and renders one page at a time; the
// pool serializes requests, so no two renders overlap on this thread.
let doc: LoadedDocument | undefined;
let encodeType = 'image/webp';
let renderExt: PageExt = 'webp';

// pdf.js never exposes a page image's original encoded bytes, so a copy of the source
// bytes is kept to parse the PDF structure separately (lazily, only if a single
// full-page image is ever seen). Building the parser is deferred and memoized here.
let pdfLibBytes: Uint8Array | undefined;
let extractor: ImageExtractor | undefined;
let extractorReady = false;

ctx.onmessage = (event: MessageEvent<RenderRequest>): void => {
  const request = event.data;
  if (request.type === 'open') {
    void open(request.buffer, request.withMetadata, request.encodeType);
  } else {
    void renderPage(request.index);
  }
};

function post(message: RenderResponse, transfer: readonly Transferable[] = []): void {
  ctx.postMessage(message, transfer as Transferable[]);
}

async function open(buffer: ArrayBuffer, withMetadata: boolean, type: string): Promise<void> {
  encodeType = type;
  renderExt = type === 'image/jpeg' ? 'jpg' : 'webp';
  // Copy the bytes before pdf.js takes (and may detach) the buffer, so the structure
  // parser still has them to read original image streams from.
  pdfLibBytes = new Uint8Array(buffer.slice(0));
  try {
    doc = await loadDocument(buffer);
    const metadata = withMetadata ? await doc.getMetadata() : undefined;
    post(
      metadata
        ? { type: 'opened', pageCount: doc.pageCount, metadata }
        : { type: 'opened', pageCount: doc.pageCount },
    );
  } catch (error) {
    post({ type: 'open-error', message: describePdfError(error) });
  }
}

// Build the structure parser on first use; a parse failure disables extraction for the
// whole document (every page then renders) rather than retrying per page.
async function getExtractor(): Promise<ImageExtractor | undefined> {
  if (!extractorReady) {
    extractorReady = true;
    if (pdfLibBytes) {
      try {
        extractor = await createImageExtractor(pdfLibBytes);
      } catch {
        extractor = undefined;
      }
    }
  }
  return extractor;
}

async function renderPage(index: number): Promise<void> {
  if (!doc) {
    post({ type: 'render-error', index, message: 'Document not opened.' });
    return;
  }
  try {
    const page = await doc.getPage(index + 1);
    const analysis = await page.analyze();

    // A single full-page image may be emittable without a lossy re-render: copy its
    // original bytes (JPEG) or, for a lossless source, rasterize to PNG instead of WebP.
    if (analysis.singleFullPageImage && analysis.imageWidthPx && analysis.imageHeightPx) {
      const found = (await getExtractor())?.find(
        index,
        analysis.imageWidthPx,
        analysis.imageHeightPx,
        analysis.imageUpright ?? false,
      );
      if (found) {
        const mode = decideExtract(found.descriptor);
        if (mode === 'passthrough' && (analysis.imageLongEdgePx ?? 0) <= EXTRACT_MAX_LONG_EDGE_PX) {
          const bytes = new Uint8Array(found.rawBytes);
          post({ type: 'rendered', index, bytes, ext: 'jpg' }, [bytes.buffer]);
          return;
        }
        if (mode === 'lossless') {
          await emitRender(index, page, analysis, 'image/png', 'png');
          return;
        }
      }
    }

    await emitRender(index, page, analysis, encodeType, renderExt);
  } catch (error) {
    post({ type: 'render-error', index, message: errorMessage(error, 'Page skipped.') });
  }
}

// Rasterize a page and encode it to `type`, posting the bytes with their extension.
async function emitRender(
  index: number,
  page: LoadedPage,
  analysis: PageAnalysis,
  type: string,
  ext: PageExt,
): Promise<void> {
  const scale = chooseScale({ ...analysis, widthPt: page.widthPt, heightPt: page.heightPt });
  const canvas = new OffscreenCanvas(1, 1);
  await page.render(canvas, scale);
  const blob = await canvas.convertToBlob({ type, quality: ENCODE_QUALITY });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  post({ type: 'rendered', index, bytes, ext }, [bytes.buffer]);
}
