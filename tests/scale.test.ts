// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { chooseScale, MIN_SCALE, renderScale, singleImageScale } from '../src/core/scale';

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

describe('singleImageScale', () => {
  const cap = { maxLongEdgePx: 4000 } as const;

  it('renders the page so the image lands at its native pixel size', () => {
    // 600pt page holding a 1800px image wants 3x to reproduce it natively.
    expect(singleImageScale(600, 1800, cap)).toBe(3);
  });

  it('caps the long edge so a huge scan cannot allocate an unbounded canvas', () => {
    expect(singleImageScale(1000, 10000, cap)).toBe(4); // clamped to 4000px / 1000pt
  });

  it('never upscales a low-resolution image below 1:1', () => {
    expect(singleImageScale(1000, 500, cap)).toBe(MIN_SCALE);
  });

  it('returns the floor for non-positive inputs', () => {
    expect(singleImageScale(0, 1800, cap)).toBe(MIN_SCALE);
    expect(singleImageScale(600, 0, cap)).toBe(MIN_SCALE);
  });
});

describe('chooseScale', () => {
  it('renders a single full-page image at its native resolution', () => {
    const native = singleImageScale(600, 1800);
    expect(
      chooseScale({
        singleFullPageImage: true,
        imageLongEdgePx: 1800,
        widthPt: 600,
        heightPt: 400,
      }),
    ).toBe(native);
  });

  it('falls back to the target scale for a mixed page', () => {
    expect(chooseScale({ singleFullPageImage: false, widthPt: 600, heightPt: 400 })).toBe(
      renderScale(600, 400),
    );
  });

  it('uses the target scale when an image page reports no pixel size', () => {
    expect(chooseScale({ singleFullPageImage: true, widthPt: 600, heightPt: 400 })).toBe(
      renderScale(600, 400),
    );
  });
});
