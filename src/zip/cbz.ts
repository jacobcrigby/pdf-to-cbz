// SPDX-License-Identifier: AGPL-3.0-or-later
import { Zip, ZipPassThrough } from 'fflate';

/** Where archive bytes go as they are produced — collected in memory or streamed to disk. */
export interface ArchiveSink {
  write(chunk: Uint8Array<ArrayBuffer>): void;
  close(): Promise<void>;
}

export interface CbzWriter {
  /** Append one already-encoded entry; STORE'd verbatim. */
  addStored(name: string, bytes: Uint8Array): void;
  /** Close the archive, flushing the central directory through the sink. */
  finish(): Promise<void>;
}

/**
 * Streaming CBZ (ZIP) writer. Pages are WebP/JPEG and thus already compressed, so
 * entries are STORE'd via `ZipPassThrough` — recompressing would burn CPU for no
 * size gain. Chunks flow to the sink as they are produced, so a streaming sink
 * keeps peak memory flat regardless of archive size.
 */
export function createCbzWriter(sink: ArchiveSink): CbzWriter {
  let resolveDone!: () => void;
  let rejectDone!: (error: Error) => void;
  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const zip = new Zip((error, chunk, final) => {
    if (error) {
      rejectDone(error);
      return;
    }
    // fflate emits fresh ArrayBuffer-backed chunks; the generic narrowing is safe.
    sink.write(chunk as Uint8Array<ArrayBuffer>);
    if (final) {
      resolveDone();
    }
  });

  return {
    addStored(name, bytes) {
      const entry = new ZipPassThrough(name);
      zip.add(entry);
      entry.push(bytes, true);
    },
    async finish() {
      zip.end();
      await done;
      await sink.close();
    },
  };
}
