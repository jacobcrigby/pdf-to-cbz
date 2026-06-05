// SPDX-License-Identifier: AGPL-3.0-or-later
import type { PageExt } from './naming';
import type { RawPdfMetadata } from './pdf-metadata';

/** Main thread → render worker. */
export type RenderRequest =
  | {
      // Load the PDF and (for one worker) read its metadata. `buffer` is transferred.
      readonly type: 'open';
      readonly buffer: ArrayBuffer;
      readonly withMetadata: boolean;
      readonly encodeType: string;
    }
  | { readonly type: 'render'; readonly index: number };

/** Render worker → main thread. */
export type RenderResponse =
  | { readonly type: 'opened'; readonly pageCount: number; readonly metadata?: RawPdfMetadata }
  | { readonly type: 'open-error'; readonly message: string }
  | {
      // A finished page — rendered or extracted. `ext` is the entry's file extension,
      // which varies per page (passthrough jpg, lossless png, or rendered webp/jpg).
      readonly type: 'rendered';
      readonly index: number;
      readonly bytes: Uint8Array<ArrayBuffer>;
      readonly ext: PageExt;
    }
  | { readonly type: 'render-error'; readonly index: number; readonly message: string };
