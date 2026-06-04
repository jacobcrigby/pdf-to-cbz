// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { isSingleFullPageImage } from '../src/core/page-classifier';

describe('isSingleFullPageImage', () => {
  it('accepts a page that paints exactly one image and nothing else', () => {
    expect(isSingleFullPageImage({ imagePaintCount: 1, disqualifyingOpCount: 0 })).toBe(true);
  });

  it('rejects a page that also draws text or paths', () => {
    expect(isSingleFullPageImage({ imagePaintCount: 1, disqualifyingOpCount: 3 })).toBe(false);
  });

  it('rejects a page with no image', () => {
    expect(isSingleFullPageImage({ imagePaintCount: 0, disqualifyingOpCount: 0 })).toBe(false);
  });

  it('rejects a page with multiple images', () => {
    expect(isSingleFullPageImage({ imagePaintCount: 2, disqualifyingOpCount: 0 })).toBe(false);
  });
});
