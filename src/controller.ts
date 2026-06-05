// SPDX-License-Identifier: AGPL-3.0-or-later
import { buildComicInfoXml } from './core/comicinfo';
import { padPageName, toOutputFilename } from './core/naming';
import { errorMessage } from './core/pdf-errors';
import type { ComicMetadata } from './core/pdf-metadata';
import { createCbzWriter, type ArchiveSink } from './zip/cbz';
import type { RenderPool } from './worker/pool';

export interface ConversionHandlers {
  onProgress(page: number, pageCount: number): void;
  onWarning(page: number, message: string): void;
  onDone(filename: string): void;
  onError(message: string): void;
  /** Cancelled by the user (or the save dialog dismissed): no output produced. */
  onCancelled(): void;
}

export interface ConversionInput {
  /** The render pool opened when the file was selected; consumed and terminated here. */
  readonly pool: RenderPool;
  readonly file: File;
  readonly fileSystemAccess: boolean;
}

// The proper CBZ media type, used for the File System Access save dialog's file-type
// filter (where the OS handles the name and extension correctly).
const CBZ_MIME = 'application/vnd.comicbook+zip';

// For the Blob + anchor fallback, label the data as generic binary instead. Chrome on
// Android derives a download's handling from the Blob's MIME type; given the unknown
// `vnd.comicbook+zip` it mangles the `.cbz` extension (e.g. appends a de-dupe counter
// after it). `application/octet-stream` tells the browser to save the bytes verbatim
// under the name the anchor supplies, leaving the extension intact.
const DOWNLOAD_MIME = 'application/octet-stream';

// One PDF at a time: a job in flight owns the worker pool until it settles.
let running = false;

/** Convert the already-opened PDF pool to a CBZ with `metadata` and download it. */
export function startConversion(
  input: ConversionInput,
  metadata: ComicMetadata,
  handlers: ConversionHandlers,
  signal?: AbortSignal,
): void {
  if (running) {
    // A job already owns the workers; free this surplus pool rather than leak it.
    input.pool.terminate();
    return;
  }
  running = true;
  void drive(input, metadata, handlers, signal).finally(() => {
    running = false;
  });
}

async function drive(
  input: ConversionInput,
  metadata: ComicMetadata,
  handlers: ConversionHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const { pool, file, fileSystemAccess } = input;
  const filename = toOutputFilename(file.name);

  try {
    // Ask for the save location while the user gesture is still active — before any
    // other await — so File System Access can stream the archive straight to disk.
    let writable: FileSystemWritableFileStream | undefined;
    if (fileSystemAccess) {
      try {
        const handle = await showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'Comic archive', accept: { [CBZ_MIME]: ['.cbz'] } }],
        });
        writable = await handle.createWritable();
      } catch (error) {
        if (isAbort(error)) {
          // Dismissing the save dialog cancels the job before any work begins.
          handlers.onCancelled();
          return;
        }
        // Any other picker failure falls back to a Blob download.
      }
    }

    try {
      const { pageCount } = pool;
      // FSA streams straight to disk; otherwise buffer for a Blob download at the end.
      const delivery = writable ? streamDelivery(writable) : blobDelivery(filename);
      const writer = createCbzWriter(delivery.sink);
      let written = 0;

      await pool.run(
        {
          // Pages arrive in reading order, so written-index naming stays contiguous. The
          // extension is per page: extracted JPEG/PNG and rendered WebP/JPEG can coexist.
          onPage(_index, bytes, ext) {
            writer.addStored(padPageName(written, pageCount, ext), bytes);
            written += 1;
          },
          onSkip(index) {
            handlers.onWarning(index + 1, 'Page skipped.');
          },
          onProgress(completed, total) {
            handlers.onProgress(completed, total);
          },
        },
        signal,
      );

      writer.addStored(
        'ComicInfo.xml',
        new TextEncoder().encode(buildComicInfoXml(metadata, written)),
      );
      await writer.finish();

      delivery.finalize();
      handlers.onDone(filename);
    } catch (error) {
      if (writable) {
        // Leave no partial file behind on cancel or failure.
        await writable.abort().catch(() => undefined);
      }
      if (isAbort(error)) {
        handlers.onCancelled();
        return;
      }
      handlers.onError(errorMessage(error, 'Conversion failed.'));
    }
  } finally {
    pool.terminate();
  }
}

// Where the archive goes: a sink for the writer plus the post-finish delivery step.
interface Delivery {
  readonly sink: ArchiveSink;
  finalize(): void;
}

// Streams chunks to disk as they are produced; one write at a time so fflate output
// is applied in order. Delivery is the streaming itself, so finalize is a no-op.
function streamDelivery(writable: FileSystemWritableFileStream): Delivery {
  let chain: Promise<void> = Promise.resolve();
  return {
    sink: {
      write(chunk) {
        chain = chain.then(() => writable.write(chunk));
      },
      async close() {
        await chain;
        await writable.close();
      },
    },
    finalize() {
      // Nothing to do: bytes already reached disk.
    },
  };
}

// Collects chunks in memory, then triggers a Blob + anchor download on finalize.
function blobDelivery(filename: string): Delivery {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  return {
    sink: {
      write(chunk) {
        chunks.push(chunk);
      },
      close() {
        return Promise.resolve();
      },
    },
    finalize() {
      triggerDownload(new Blob(chunks, { type: DOWNLOAD_MIME }), filename);
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
