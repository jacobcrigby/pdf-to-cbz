// SPDX-License-Identifier: AGPL-3.0-or-later
import { describePdfError, errorMessage } from '../core/pdf-errors';
import { ENCODE_QUALITY } from '../core/render-config';
import { chooseScale } from '../core/scale';
import type { RenderRequest, RenderResponse } from '../core/types';
import { loadDocument, type LoadedDocument } from '../pdf/pdfjs';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// One render worker owns one pdf.js document and renders one page at a time; the
// pool serializes requests, so no two renders overlap on this thread.
let doc: LoadedDocument | undefined;
let encodeType = 'image/webp';

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

async function renderPage(index: number): Promise<void> {
  if (!doc) {
    post({ type: 'render-error', index, message: 'Document not opened.' });
    return;
  }
  try {
    const page = await doc.getPage(index + 1);
    const analysis = await page.analyze();
    const scale = chooseScale({ ...analysis, widthPt: page.widthPt, heightPt: page.heightPt });
    const canvas = new OffscreenCanvas(1, 1);
    await page.render(canvas, scale);
    const blob = await canvas.convertToBlob({ type: encodeType, quality: ENCODE_QUALITY });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    post({ type: 'rendered', index, bytes }, [bytes.buffer]);
  } catch (error) {
    post({ type: 'render-error', index, message: errorMessage(error, 'Page skipped.') });
  }
}
