// SPDX-License-Identifier: AGPL-3.0-or-later
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createCbzWriter, type ArchiveSink } from '../src/zip/cbz';

function collector(): { sink: ArchiveSink; bytes: () => Uint8Array } {
  const chunks: Uint8Array[] = [];
  return {
    sink: {
      write: (chunk) => chunks.push(chunk),
      close: () => Promise.resolve(),
    },
    bytes: () => {
      const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const out = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
      }
      return out;
    },
  };
}

describe('createCbzWriter', () => {
  it('writes a STORE archive a reader can extract', async () => {
    const { sink, bytes } = collector();
    const writer = createCbzWriter(sink);
    const page = new Uint8Array([1, 2, 3, 4, 5]);
    writer.addStored('0001.webp', page);
    writer.addStored('ComicInfo.xml', new TextEncoder().encode('<ComicInfo/>'));
    await writer.finish();

    const entries = unzipSync(bytes());
    expect(Object.keys(entries).sort()).toEqual(['0001.webp', 'ComicInfo.xml']);
    expect(entries['0001.webp']).toEqual(page);
    expect(new TextDecoder().decode(entries['ComicInfo.xml'])).toBe('<ComicInfo/>');
  });

  it('closes the sink and yields a valid empty archive when nothing is added', async () => {
    const { sink, bytes } = collector();
    let closed = false;
    await createCbzWriter({
      write: sink.write,
      close: () => {
        closed = true;
        return Promise.resolve();
      },
    }).finish();
    expect(closed).toBe(true);
    expect(Object.keys(unzipSync(bytes()))).toEqual([]);
  });
});
