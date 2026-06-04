// SPDX-License-Identifier: AGPL-3.0-or-later
import { Zip, ZipPassThrough } from 'fflate';

export interface CbzWriter {
  /** Append one already-encoded page; STORE'd verbatim. */
  addStored(name: string, bytes: Uint8Array): void;
  /** Close the archive and resolve the concatenated bytes. */
  finish(): Promise<Uint8Array<ArrayBuffer>>;
}

/**
 * Streaming CBZ (ZIP) writer. Pages are WebP/JPEG and thus already compressed, so
 * entries are STORE'd via `ZipPassThrough` — recompressing would burn CPU for no
 * size gain. Output chunks accumulate until `finish`, the non-streamed delivery
 * ceiling addressed by File System Access in a later phase.
 */
export function createCbzWriter(): CbzWriter {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let settle: ((archive: Uint8Array<ArrayBuffer>) => void) | undefined;
  let fail: ((error: Error) => void) | undefined;

  const zip = new Zip((error, chunk, final) => {
    if (error) {
      fail?.(error);
      return;
    }
    chunks.push(chunk);
    total += chunk.length;
    if (final) {
      settle?.(concat(chunks, total));
    }
  });

  return {
    addStored(name, bytes) {
      const entry = new ZipPassThrough(name);
      zip.add(entry);
      entry.push(bytes, true);
    },
    finish() {
      return new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
        settle = resolve;
        fail = reject;
        zip.end();
      });
    },
  };
}

function concat(chunks: readonly Uint8Array[], total: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
