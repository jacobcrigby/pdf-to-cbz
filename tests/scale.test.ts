// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { MIN_SCALE, renderScale } from '../src/core/scale';

// Tests pin explicit target/max so they do not depend on build-time env defaults.
const opts = { targetLongEdgePx: 1600, maxScale: 2.0 } as const;

describe('renderScale', () => {
  it('keeps a page already at the target at 1:1 (never downscales below the floor)', () => {
    expect(renderScale(1600, 1600, opts)).toBe(MIN_SCALE);
  });

  it('clamps a larger-than-target page up to the floor rather than shrinking it', () => {
    expect(renderScale(3200, 3200, opts)).toBe(MIN_SCALE);
    expect(renderScale(2000, 1000, opts)).toBe(MIN_SCALE);
  });

  it('uses the longer edge to choose the scale', () => {
    expect(renderScale(400, 1200, opts)).toBeCloseTo(1600 / 1200);
    expect(renderScale(1200, 400, opts)).toBeCloseTo(1600 / 1200);
  });

  it('enlarges a mid-size page toward the target without clamping', () => {
    expect(renderScale(800, 600, opts)).toBe(2.0);
    expect(renderScale(1000, 1000, opts)).toBeCloseTo(1.6);
  });

  it('caps a tiny page at maxScale', () => {
    expect(renderScale(100, 100, opts)).toBe(2.0);
  });

  it('honors overridden target and maxScale', () => {
    expect(renderScale(100, 100, { maxScale: 3 })).toBe(3);
    expect(renderScale(800, 800, { targetLongEdgePx: 800, maxScale: 4 })).toBe(MIN_SCALE);
  });

  it('returns the floor for non-positive dimensions instead of dividing by zero', () => {
    expect(renderScale(0, 0, opts)).toBe(MIN_SCALE);
    expect(renderScale(-10, -10, opts)).toBe(MIN_SCALE);
  });
});
