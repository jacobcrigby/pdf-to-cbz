// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { POOL_MAX, poolSize } from '../src/core/pool-size';

describe('poolSize', () => {
  it('uses a single worker on a low-memory device', () => {
    expect(poolSize({ hardwareConcurrency: 1, deviceMemory: 1 })).toBe(1);
    expect(poolSize({ hardwareConcurrency: 8, deviceMemory: 4 })).toBe(1);
  });

  it('is bounded by memory headroom, not just cores', () => {
    expect(poolSize({ hardwareConcurrency: 8, deviceMemory: 8 })).toBe(2);
    expect(poolSize({ hardwareConcurrency: 2, deviceMemory: 16 })).toBe(2);
  });

  it('caps at POOL_MAX even with abundant resources', () => {
    expect(poolSize({ hardwareConcurrency: 16, deviceMemory: 32 })).toBe(POOL_MAX);
  });

  it('never returns less than one', () => {
    expect(poolSize({ hardwareConcurrency: 0, deviceMemory: 0 })).toBe(1);
  });
});
