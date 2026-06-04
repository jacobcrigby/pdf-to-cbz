// SPDX-License-Identifier: AGPL-3.0-or-later
import { buildComicInfoXml } from './core/comicinfo';
import { padPageName, toOutputFilename, type PageExt } from './core/naming';
import { toComicMetadata } from './core/pdf-metadata';
import { poolSize } from './core/pool-size';
import type { RuntimeCapabilities } from './core/runtime-capabilities';
import { createCbzWriter } from './zip/cbz';
import { openPool } from './worker/pool';

export interface ConversionHandlers {
  onProgress(page: number, pageCount: number): void;
  onWarning(page: number, message: string): void;
  onDone(filename: string): void;
  onError(message: string): void;
}

// One PDF at a time: a job in flight owns the worker pool until it settles.
let running = false;

/** Convert `file` to a CBZ and download it, reporting progress through `handlers`. */
export function startConversion(
  file: File,
  capabilities: RuntimeCapabilities,
  handlers: ConversionHandlers,
): void {
  if (running) {
    return;
  }
  if (!capabilities.offscreenCanvas || !capabilities.moduleWorkers) {
    handlers.onError('This browser is not supported yet.');
    return;
  }
  running = true;
  void drive(file, capabilities, handlers).finally(() => {
    running = false;
  });
}

async function drive(
  file: File,
  capabilities: RuntimeCapabilities,
  handlers: ConversionHandlers,
): Promise<void> {
  const filename = toOutputFilename(file.name);
  const ext: PageExt = capabilities.webpEncode ? 'webp' : 'jpg';
  const encodeType = capabilities.webpEncode ? 'image/webp' : 'image/jpeg';

  try {
    const buffer = await file.arrayBuffer();
    const pool = await openPool(buffer, poolSize(capabilities), { encodeType, ext });
    try {
      const { pageCount } = pool;
      const writer = createCbzWriter();
      let written = 0;

      await pool.run({
        // Pages arrive in reading order, so written-index naming stays contiguous.
        onPage(_index, bytes) {
          writer.addStored(padPageName(written, pageCount, ext), bytes);
          written += 1;
        },
        onSkip(index) {
          handlers.onWarning(index + 1, 'Page skipped.');
        },
        onProgress(completed, total) {
          handlers.onProgress(completed, total);
        },
      });

      const meta = toComicMetadata(pool.metadata ?? {}, {
        fallbackTitle: filename.replace(/\.cbz$/i, ''),
      });
      writer.addStored('ComicInfo.xml', new TextEncoder().encode(buildComicInfoXml(meta, written)));
      const archive = await writer.finish();

      triggerDownload(archive, filename);
      handlers.onDone(filename);
    } finally {
      pool.terminate();
    }
  } catch (error) {
    handlers.onError(
      error instanceof Error && error.message ? error.message : 'Conversion failed.',
    );
  }
}

function triggerDownload(bytes: Uint8Array<ArrayBuffer>, filename: string): void {
  const blob = new Blob([bytes], { type: 'application/vnd.comicbook+zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
