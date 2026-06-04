// SPDX-License-Identifier: AGPL-3.0-or-later
import { createPageScheduler } from '../core/page-scheduler';
import type { PageExt } from '../core/naming';
import type { RawPdfMetadata } from '../core/pdf-metadata';
import type { RenderRequest, RenderResponse } from '../core/types';

export interface RunHandlers {
  /** A rendered page, delivered in reading order. */
  onPage(index: number, bytes: Uint8Array<ArrayBuffer>): void;
  /** A page that could not be rendered and was skipped, in reading order. */
  onSkip(index: number): void;
  /** Settled-page count out of the total, for progress. */
  onProgress(completed: number, total: number): void;
}

export interface RenderPool {
  readonly pageCount: number;
  /** Render every page, delivering results in order; resolves when all have settled. */
  run(handlers: RunHandlers): Promise<void>;
  terminate(): void;
}

interface OpenOptions {
  readonly encodeType: string;
  readonly ext: PageExt;
}

// A few pages per worker keeps every worker fed while bounding how many encoded
// pages sit buffered awaiting their turn in reading order.
const WINDOW_PER_WORKER = 3;

function spawn(): Worker {
  return new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
}

/** Open the PDF in a throwaway worker just to read its document metadata. */
export async function readPdfMetadata(buffer: ArrayBuffer): Promise<RawPdfMetadata | undefined> {
  const worker = spawn();
  try {
    return await new Promise<RawPdfMetadata | undefined>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<RenderResponse>): void => {
        const message = event.data;
        if (message.type === 'opened') {
          resolve(message.metadata);
        } else if (message.type === 'open-error') {
          reject(new Error(message.message));
        }
      };
      worker.onerror = (event): void => reject(new Error(event.message || 'Worker failed.'));
      const request: RenderRequest = {
        type: 'open',
        buffer,
        withMetadata: true,
        encodeType: 'image/webp',
        ext: 'webp',
      };
      worker.postMessage(request, [buffer]);
    });
  } finally {
    worker.terminate();
  }
}

/** Spawn `size` render workers, each with its own PDF copy. */
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
    (worker) =>
      new Promise<number>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<RenderResponse>): void => {
          const message = event.data;
          if (message.type === 'opened') {
            resolve(message.pageCount);
          } else if (message.type === 'open-error') {
            reject(new Error(message.message));
          }
        };
        worker.onerror = (event): void => reject(new Error(event.message || 'Worker failed.'));
        const buf = single ? buffer : buffer.slice(0);
        const request: RenderRequest = {
          type: 'open',
          buffer: buf,
          withMetadata: false,
          encodeType: opts.encodeType,
          ext: opts.ext,
        };
        worker.postMessage(request, [buf]);
      }),
  );

  let pageCounts: number[];
  try {
    pageCounts = await Promise.all(opened);
  } catch (error) {
    terminate();
    throw error;
  }

  const pageCount = pageCounts[0] ?? 0;

  return {
    pageCount,
    terminate,
    run(handlers) {
      return drivePool(workers, pageCount, handlers);
    },
  };
}

function drivePool(workers: Worker[], pageCount: number, handlers: RunHandlers): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const window = Math.max(1, workers.length * WINDOW_PER_WORKER);
    const scheduler = createPageScheduler(pageCount, window);
    const pageBytes = new Map<number, Uint8Array<ArrayBuffer>>();
    const idle: Worker[] = [...workers];
    let settledCount = 0;

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
      if (message.type === 'rendered') {
        pageBytes.set(message.index, message.bytes);
      } else if (message.type !== 'render-error') {
        return;
      }
      for (const page of scheduler.settle(message.index, message.type === 'rendered')) {
        const bytes = pageBytes.get(page.index);
        pageBytes.delete(page.index);
        if (page.ok && bytes) {
          handlers.onPage(page.index, bytes);
        } else {
          handlers.onSkip(page.index);
        }
        settledCount += 1;
        handlers.onProgress(settledCount, pageCount);
      }
      idle.push(worker);
      pump();
      if (scheduler.done) {
        resolve();
      }
    };

    for (const worker of workers) {
      worker.onerror = (event): void => reject(new Error(event.message || 'Worker failed.'));
      worker.onmessage = (event: MessageEvent<RenderResponse>): void => handle(worker, event.data);
    }

    pump();
    if (scheduler.done) {
      resolve();
    }
  });
}
