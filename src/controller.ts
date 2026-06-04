// SPDX-License-Identifier: AGPL-3.0-or-later
import { toOutputFilename } from './core/naming';
import type { RuntimeCapabilities } from './core/runtime-capabilities';
import type { ConvertRequest, ConvertResponse } from './core/types';

export interface ConversionHandlers {
  onProgress(page: number, pageCount: number): void;
  onWarning(page: number, message: string): void;
  onDone(filename: string): void;
  onError(message: string): void;
}

// One PDF at a time: a job in flight owns the single worker until it settles.
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
  void drive(file, capabilities, handlers);
}

async function drive(
  file: File,
  capabilities: RuntimeCapabilities,
  handlers: ConversionHandlers,
): Promise<void> {
  const worker = new Worker(new URL('./worker/convert.worker.ts', import.meta.url), {
    type: 'module',
  });
  const stop = (): void => {
    worker.terminate();
    running = false;
  };

  worker.onerror = (event): void => {
    stop();
    handlers.onError(event.message || 'Conversion failed.');
  };
  worker.onmessage = (event: MessageEvent<ConvertResponse>): void => {
    const message = event.data;
    switch (message.type) {
      case 'progress':
        handlers.onProgress(message.page, message.pageCount);
        break;
      case 'warning':
        handlers.onWarning(message.page, message.message);
        break;
      case 'done':
        triggerDownload(message.bytes, message.filename);
        stop();
        handlers.onDone(message.filename);
        break;
      case 'error':
        stop();
        handlers.onError(message.message);
        break;
    }
  };

  const buffer = await file.arrayBuffer();
  const request: ConvertRequest = {
    buffer,
    capabilities,
    filename: toOutputFilename(file.name),
  };
  worker.postMessage(request, [buffer]);
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
