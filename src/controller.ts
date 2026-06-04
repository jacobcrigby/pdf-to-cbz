// SPDX-License-Identifier: AGPL-3.0-or-later
import { buildComicInfoXml } from './core/comicinfo';
import { padPageName, toOutputFilename, type PageExt } from './core/naming';
import type { ComicMetadata } from './core/pdf-metadata';
import { poolSize } from './core/pool-size';
import type { RuntimeCapabilities } from './core/runtime-capabilities';
import { createCbzWriter, type ArchiveSink } from './zip/cbz';
import { openPool } from './worker/pool';

export interface ConversionHandlers {
  onProgress(page: number, pageCount: number): void;
  onWarning(page: number, message: string): void;
  onDone(filename: string): void;
  onError(message: string): void;
}

const CBZ_MIME = 'application/vnd.comicbook+zip';

// One PDF at a time: a job in flight owns the worker pool until it settles.
let running = false;

/** Convert `file` to a CBZ with the given metadata and download it. */
export function startConversion(
  file: File,
  capabilities: RuntimeCapabilities,
  metadata: ComicMetadata,
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
  void drive(file, capabilities, metadata, handlers).finally(() => {
    running = false;
  });
}

async function drive(
  file: File,
  capabilities: RuntimeCapabilities,
  metadata: ComicMetadata,
  handlers: ConversionHandlers,
): Promise<void> {
  const filename = toOutputFilename(file.name);
  const ext: PageExt = capabilities.webpEncode ? 'webp' : 'jpg';
  const encodeType = capabilities.webpEncode ? 'image/webp' : 'image/jpeg';

  // Ask for the save location while the user gesture is still active — before any
  // await — so File System Access can stream the archive straight to disk.
  let writable: FileSystemWritableFileStream | undefined;
  if (capabilities.fileSystemAccess) {
    try {
      const handle = await showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Comic archive', accept: { [CBZ_MIME]: ['.cbz'] } }],
      });
      writable = await handle.createWritable();
    } catch (error) {
      if (isAbort(error)) {
        handlers.onError('Cancelled.');
        return;
      }
      // Any other picker failure falls back to a Blob download.
    }
  }

  try {
    const buffer = await file.arrayBuffer();
    const pool = await openPool(buffer, poolSize(capabilities, buffer.byteLength), {
      encodeType,
      ext,
    });
    try {
      const { pageCount } = pool;
      let sink: ArchiveSink;
      let blob: (ArchiveSink & { blob(): Blob }) | undefined;
      if (writable) {
        sink = streamSink(writable);
      } else {
        blob = blobSink();
        sink = blob;
      }
      const writer = createCbzWriter(sink);
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

      writer.addStored(
        'ComicInfo.xml',
        new TextEncoder().encode(buildComicInfoXml(metadata, written)),
      );
      await writer.finish();

      if (blob) {
        triggerDownload(blob.blob(), filename);
      }
      handlers.onDone(filename);
    } finally {
      pool.terminate();
    }
  } catch (error) {
    if (writable) {
      // Leave no partial file behind on failure.
      await writable.abort().catch(() => undefined);
    }
    handlers.onError(
      error instanceof Error && error.message ? error.message : 'Conversion failed.',
    );
  }
}

// Streams chunks to disk; one write at a time so fflate output is applied in order.
function streamSink(writable: FileSystemWritableFileStream): ArchiveSink {
  let chain: Promise<void> = Promise.resolve();
  return {
    write(chunk) {
      chain = chain.then(() => writable.write(chunk));
    },
    async close() {
      await chain;
      await writable.close();
    },
  };
}

// Collects chunks in memory for a Blob + anchor download.
function blobSink(): ArchiveSink & { blob(): Blob } {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  return {
    write(chunk) {
      chunks.push(chunk);
    },
    close() {
      return Promise.resolve();
    },
    blob() {
      return new Blob(chunks, { type: CBZ_MIME });
    },
  };
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
