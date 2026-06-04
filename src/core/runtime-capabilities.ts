// SPDX-License-Identifier: AGPL-3.0-or-later

// Conservative resource hints used when the browser does not report a value.
const DEFAULT_HARDWARE_CONCURRENCY = 1;
const DEFAULT_DEVICE_MEMORY_GIB = 1;

/**
 * Measured features and resource hints of the current runtime. All adaptive
 * behavior (pool size, compression level, delivery) derives from this record
 * downstream — gated by measured capability, never by device class.
 *
 * A plain, structured-cloneable record so it can cross a `postMessage` boundary
 * to a worker unchanged.
 */
export interface RuntimeCapabilities {
  readonly offscreenCanvas: boolean;
  readonly webpEncode: boolean;
  readonly fileSystemAccess: boolean;
  readonly moduleWorkers: boolean;
  readonly hardwareConcurrency: number;
  readonly deviceMemory: number;
}

/** Raw probe inputs before defaults and clamping are applied. */
export interface RawCapabilities {
  readonly offscreenCanvas: boolean;
  readonly webpEncode: boolean;
  readonly fileSystemAccess: boolean;
  readonly moduleWorkers: boolean;
  readonly hardwareConcurrency?: number | undefined;
  readonly deviceMemory?: number | undefined;
}

/** The runtime surface the probe reads, injectable so tests avoid real globals. */
export interface CapabilityEnv {
  readonly hardwareConcurrency?: number | undefined;
  readonly deviceMemory?: number | undefined;
  readonly fileSystemAccess: boolean;
  readonly offscreenCanvas: boolean;
  readonly webpEncode: boolean;
  readonly moduleWorkers: boolean;
}

/**
 * Normalize raw probe results into capabilities: apply conservative defaults for
 * absent resource hints and clamp concurrency to a usable floor. Pure — no globals.
 */
export function deriveCapabilities(raw: RawCapabilities): RuntimeCapabilities {
  return {
    offscreenCanvas: raw.offscreenCanvas,
    webpEncode: raw.webpEncode,
    fileSystemAccess: raw.fileSystemAccess,
    moduleWorkers: raw.moduleWorkers,
    hardwareConcurrency: clampConcurrency(raw.hardwareConcurrency),
    deviceMemory: positiveOrDefault(raw.deviceMemory, DEFAULT_DEVICE_MEMORY_GIB),
  };
}

/** Probe the runtime. Defaults to the real environment; tests inject their own. */
export function probeRuntimeCapabilities(env: CapabilityEnv = realEnv()): RuntimeCapabilities {
  return deriveCapabilities(env);
}

function clampConcurrency(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_HARDWARE_CONCURRENCY;
  }
  return Math.max(DEFAULT_HARDWARE_CONCURRENCY, Math.floor(value));
}

function positiveOrDefault(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

function realEnv(): CapabilityEnv {
  const offscreenCanvas = typeof OffscreenCanvas !== 'undefined';
  return {
    hardwareConcurrency: globalThis.navigator?.hardwareConcurrency,
    // `deviceMemory` is a non-standard hint absent from the DOM typings.
    deviceMemory: (globalThis.navigator as { deviceMemory?: number } | undefined)?.deviceMemory,
    fileSystemAccess: typeof window !== 'undefined' && 'showSaveFilePicker' in window,
    offscreenCanvas,
    webpEncode: detectWebpEncode(),
    moduleWorkers: detectModuleWorkerSupport(),
  };
}

// Some engines silently emit PNG when asked for WebP, so confirm the output MIME
// rather than assuming a canvas implies WebP export.
function detectWebpEncode(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

// Module workers can only be feature-detected by constructing one. A getter on
// the `type` option records whether the engine reads worker options at all, which
// it does only where typed workers are supported.
function detectModuleWorkerSupport(): boolean {
  if (typeof Worker === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return false;
  }
  let supported = false;
  const url = URL.createObjectURL(new Blob([''], { type: 'text/javascript' }));
  try {
    const options: WorkerOptions = {
      get type(): WorkerType {
        supported = true;
        return 'module';
      },
    };
    const worker = new Worker(url, options);
    worker.terminate();
  } catch {
    supported = false;
  } finally {
    URL.revokeObjectURL(url);
  }
  return supported;
}
