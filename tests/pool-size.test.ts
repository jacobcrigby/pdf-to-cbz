// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { POOL_MAX, poolSize } from '../src/core/pool-size';

// A small PDF so the size cap never constrains the resource-based cases.
const SMALL = 4 * 1024 * 1024;

describe('poolSize', () => {
  it('uses a single worker on a low-memory device', () => {
    expect(poolSize({ hardwareConcurrency: 1, deviceMemory: 1 }, SMALL)).toBe(1);
    expect(poolSize({ hardwareConcurrency: 8, deviceMemory: 4 }, SMALL)).toBe(1);
  });

  it('is bounded by memory headroom, not just cores', () => {
    expect(poolSize({ hardwareConcurrency: 8, deviceMemory: 8 }, SMALL)).toBe(2);
    expect(poolSize({ hardwareConcurrency: 2, deviceMemory: 16 }, SMALL)).toBe(2);
  });

  it('caps at POOL_MAX even with abundant resources', () => {
    expect(poolSize({ hardwareConcurrency: 16, deviceMemory: 32 }, SMALL)).toBe(POOL_MAX);
  });

  it('shrinks the pool for a large PDF to bound total copies', () => {
    const ample = { hardwareConcurrency: 16, deviceMemory: 32 };
    expect(poolSize(ample, 200 * 1024 * 1024)).toBe(1); // 256 MiB budget fits one copy
    expect(poolSize(ample, 100 * 1024 * 1024)).toBe(2);
  });

  it('never returns less than one', () => {
    expect(poolSize({ hardwareConcurrency: 0, deviceMemory: 0 }, SMALL)).toBe(1);
    expect(poolSize({ hardwareConcurrency: 16, deviceMemory: 32 }, 999 * 1024 * 1024)).toBe(1);
  });
});
