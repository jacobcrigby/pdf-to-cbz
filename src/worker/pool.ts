// SPDX-License-Identifier: AGPL-3.0-or-later
import { createPageScheduler } from '../core/page-scheduler';
import type { PageExt } from '../core/naming';
import type { RawPdfMetadata } from '../core/pdf-metadata';
import type { RenderRequest, RenderResponse } from '../core/types';

export interface RunHandlers {
  /** A finished page (rendered or extracted), delivered in reading order. */
  onPage(index: number, bytes: Uint8Array<ArrayBuffer>, ext: PageExt): void;
  /** A page that could not be rendered and was skipped, in reading order. */
  onSkip(index: number): void;
  /** Settled-page count out of the total, for progress. */
  onProgress(completed: number, total: number): void;
}

export interface RenderPool {
  readonly pageCount: number;
  /** The PDF's document metadata, read once while opening (worker 0). */
  readonly metadata: RawPdfMetadata | undefined;
  /**
   * Render every page, delivering results in order; resolves when all have settled.
   * Aborting `signal` stops dispatch and rejects with an `AbortError`.
   */
  run(handlers: RunHandlers, signal?: AbortSignal): Promise<void>;
  terminate(): void;
}

interface OpenOptions {
  readonly encodeType: string;
}

// A few pages per worker keeps every worker fed while bounding how many encoded
// pages sit buffered awaiting their turn in reading order.
const WINDOW_PER_WORKER = 3;

function spawn(): Worker {
  return new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
}

interface OpenResult {
  readonly pageCount: number;
  readonly metadata: RawPdfMetadata | undefined;
}

/**
 * Spawn `size` render workers, each with its own PDF copy, and read the document
 * metadata from worker 0 along the way (so no separate metadata pass is needed).
 */
export async function openPool(
  buffer: ArrayBuffer,
  size: number,
  opts: OpenOptions,
): Promise<RenderPool> {
  const workers: Worker[] = [];
  for (let i = 0; i < size; i += 1) {
    workers.push(spawn());
  }
  const terminate = (): void => workers.forEach((worker) => worker.terminate());

  // Each worker needs its own PDF copy (no SharedArrayBuffer on a static host).
  // With one worker, transfer the original; with more, every worker gets a fresh
  // copy so slicing never touches an already-transferred (detached) buffer.
  const single = workers.length === 1;
  const opened = workers.map(
    (worker, index) =>
      new Promise<OpenResult>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<RenderResponse>): void => {
          const message = event.data;
          if (message.type === 'opened') {
            resolve({ pageCount: message.pageCount, metadata: message.metadata });
          } else if (message.type === 'open-error') {
            reject(new Error(message.message));
          }
        };
        worker.onerror = (event): void => reject(new Error(event.message || 'Worker failed.'));
        const buf = single ? buffer : buffer.slice(0);
        const request: RenderRequest = {
          type: 'open',
          buffer: buf,
          withMetadata: index === 0,
          encodeType: opts.encodeType,
        };
        worker.postMessage(request, [buf]);
      }),
  );

  let results: OpenResult[];
  try {
    results = await Promise.all(opened);
  } catch (error) {
    terminate();
    throw error;
  }

  const pageCount = results[0]?.pageCount ?? 0;
  const metadata = results[0]?.metadata;

  return {
    pageCount,
    metadata,
    terminate,
    run(handlers, signal) {
      return drivePool(workers, pageCount, handlers, signal);
    },
  };
}

function abortError(): DOMException {
  return new DOMException('Conversion cancelled.', 'AbortError');
}

function drivePool(
  workers: Worker[],
  pageCount: number,
  handlers: RunHandlers,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const window = Math.max(1, workers.length * WINDOW_PER_WORKER);
    const scheduler = createPageScheduler(pageCount, window);
    const pageData = new Map<number, { bytes: Uint8Array<ArrayBuffer>; ext: PageExt }>();
    const idle: Worker[] = [...workers];
    let settledCount = 0;
    let stopped = false;

    // Cancellation stops dispatch and rejects; the caller terminates the workers.
    const finish = (run: () => void): void => {
      if (stopped) {
        return;
      }
      stopped = true;
      signal?.removeEventListener('abort', onAbort);
      run();
    };
    function onAbort(): void {
      finish(() => reject(abortError()));
    }
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    signal?.addEventListener('abort', onAbort);

    // Assign queued pages to idle workers while the window allows; a worker the
    // window can't feed yet stays idle until in-order flushing advances it.
    const pump = (): void => {
      while (idle.length > 0) {
        const index = scheduler.next();
        if (index === undefined) {
          return;
        }
        const worker = idle.pop();
        const request: RenderRequest = { type: 'render', index };
        worker?.postMessage(request);
      }
    };

    const handle = (worker: Worker, message: RenderResponse): void => {
      if (stopped) {
        return;
      }
      if (message.type === 'rendered') {
        pageData.set(message.index, { bytes: message.bytes, ext: message.ext });
      } else if (message.type !== 'render-error') {
        return;
      }
      for (const page of scheduler.settle(message.index, message.type === 'rendered')) {
        const data = pageData.get(page.index);
        pageData.delete(page.index);
        if (page.ok && data) {
          handlers.onPage(page.index, data.bytes, data.ext);
        } else {
          handlers.onSkip(page.index);
        }
        settledCount += 1;
        handlers.onProgress(settledCount, pageCount);
      }
      idle.push(worker);
      pump();
      if (scheduler.done) {
        finish(resolve);
      }
    };

    for (const worker of workers) {
      worker.onerror = (event): void =>
        finish(() => reject(new Error(event.message || 'Worker failed.')));
      worker.onmessage = (event: MessageEvent<RenderResponse>): void => handle(worker, event.data);
    }

    pump();
    if (scheduler.done) {
      finish(resolve);
    }
  });
}
