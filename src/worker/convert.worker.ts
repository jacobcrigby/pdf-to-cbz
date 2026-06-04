// SPDX-License-Identifier: AGPL-3.0-or-later
import { buildComicInfoXml } from '../core/comicinfo';
import { ENCODE_QUALITY } from '../core/render-config';
import { padPageName, type PageExt } from '../core/naming';
import { toComicMetadata } from '../core/pdf-metadata';
import { renderScale, singleImageScale } from '../core/scale';
import type { ConvertRequest, ConvertResponse } from '../core/types';
import { loadDocument } from '../pdf/pdfjs';
import { createCbzWriter } from '../zip/cbz';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<ConvertRequest>): void => {
  void run(event.data);
};

function post(message: ConvertResponse, transfer?: readonly Transferable[]): void {
  if (transfer) {
    ctx.postMessage(message, transfer as Transferable[]);
  } else {
    ctx.postMessage(message);
  }
}

async function run(request: ConvertRequest): Promise<void> {
  const encode: { type: string; ext: PageExt } = request.capabilities.webpEncode
    ? { type: 'image/webp', ext: 'webp' }
    : { type: 'image/jpeg', ext: 'jpg' };

  let doc;
  try {
    doc = await loadDocument(request.buffer);
  } catch (error) {
    post({ type: 'error', message: messageOf(error, 'Could not read this PDF.') });
    return;
  }

  const raw = await doc.getMetadata();
  const writer = createCbzWriter();
  const { pageCount } = doc;
  // Name by pages actually written so a skipped page leaves no gap and the cover
  // (image 0) and PageCount stay correct.
  let written = 0;
  for (let index = 0; index < pageCount; index += 1) {
    try {
      const page = await doc.getPage(index + 1);
      const analysis = await page.analyze();
      // A single full-page image renders at its native resolution; mixed pages use
      // the default long-edge target.
      const scale =
        analysis.singleFullPageImage && analysis.imageLongEdgePx !== undefined
          ? singleImageScale(Math.max(page.widthPt, page.heightPt), analysis.imageLongEdgePx)
          : renderScale(page.widthPt, page.heightPt);
      const canvas = new OffscreenCanvas(1, 1);
      await page.render(canvas, scale);
      const blob = await canvas.convertToBlob({ type: encode.type, quality: ENCODE_QUALITY });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      writer.addStored(padPageName(written, pageCount, encode.ext), bytes);
      written += 1;
    } catch (error) {
      post({ type: 'warning', page: index + 1, message: messageOf(error, 'Page skipped.') });
    }
    post({ type: 'progress', page: index + 1, pageCount });
  }

  const meta = toComicMetadata(raw, { fallbackTitle: request.filename.replace(/\.cbz$/i, '') });
  writer.addStored('ComicInfo.xml', new TextEncoder().encode(buildComicInfoXml(meta, written)));

  const archive = await writer.finish();
  post({ type: 'done', bytes: archive, filename: request.filename }, [archive.buffer]);
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
