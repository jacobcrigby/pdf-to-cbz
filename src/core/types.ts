// SPDX-License-Identifier: AGPL-3.0-or-later
import type { RuntimeCapabilities } from './runtime-capabilities';

/** Main thread → convert worker: the whole job. `buffer` is transferred, not copied. */
export interface ConvertRequest {
  readonly buffer: ArrayBuffer;
  readonly capabilities: RuntimeCapabilities;
  readonly filename: string;
}

/** Convert worker → main thread: a progress/warning stream then one terminal message. */
export type ConvertResponse =
  | { readonly type: 'progress'; readonly page: number; readonly pageCount: number }
  | { readonly type: 'warning'; readonly page: number; readonly message: string }
  | { readonly type: 'done'; readonly bytes: Uint8Array<ArrayBuffer>; readonly filename: string }
  | { readonly type: 'error'; readonly message: string };
