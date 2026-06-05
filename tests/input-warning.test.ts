// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { inputWarning } from '../src/core/input-warning';

const MB = 1024 * 1024;

describe('inputWarning', () => {
  it('returns nothing for a small, short PDF', () => {
    expect(
      inputWarning({ fileSizeBytes: 5 * MB, pageCount: 24, streamingDelivery: true }),
    ).toBeUndefined();
  });

  it('warns on a large file', () => {
    const warning = inputWarning({
      fileSizeBytes: 250 * MB,
      pageCount: 50,
      streamingDelivery: true,
    });
    expect(warning).toMatch(/Large PDF/);
    expect(warning).toMatch(/250 MB/);
    expect(warning).toMatch(/50 pages/);
  });

  it('warns on a high page count even when the file is small', () => {
    expect(
      inputWarning({ fileSizeBytes: 10 * MB, pageCount: 500, streamingDelivery: true }),
    ).toMatch(/Large PDF/);
  });

  it('adds a memory caution when delivery is not streamed to disk', () => {
    const warning = inputWarning({
      fileSizeBytes: 300 * MB,
      pageCount: 60,
      streamingDelivery: false,
    });
    expect(warning).toMatch(/held in memory/i);
  });

  it('omits the memory caution when streaming to disk', () => {
    const warning = inputWarning({
      fileSizeBytes: 300 * MB,
      pageCount: 60,
      streamingDelivery: true,
    });
    expect(warning).not.toMatch(/held in memory/i);
  });
});
