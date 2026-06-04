// SPDX-License-Identifier: AGPL-3.0-or-later
import { MAX_SCALE, TARGET_LONG_EDGE_PX } from './render-config';

// Pages render at 1:1 or larger, never smaller: downscaling is left to the
// reader, while a small source page is enlarged toward the target long edge.
export const MIN_SCALE = 1.0;

export interface ScaleOptions {
  readonly targetLongEdgePx?: number;
  readonly maxScale?: number;
}

/**
 * Render scale for a page measured in PDF points: aim for `targetLongEdgePx` on
 * the longer edge, clamped to [MIN_SCALE, maxScale]. A non-positive dimension
 * yields MIN_SCALE so a malformed page size cannot divide into an unbounded scale.
 */
export function renderScale(widthPt: number, heightPt: number, opts?: ScaleOptions): number {
  const target = opts?.targetLongEdgePx ?? TARGET_LONG_EDGE_PX;
  const maxScale = opts?.maxScale ?? MAX_SCALE;
  const longEdge = Math.max(widthPt, heightPt);
  if (!(longEdge > 0)) {
    return MIN_SCALE;
  }
  return Math.min(maxScale, Math.max(MIN_SCALE, target / longEdge));
}
