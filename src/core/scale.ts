// SPDX-License-Identifier: AGPL-3.0-or-later
import { MAX_SCALE, NATIVE_MAX_LONG_EDGE_PX, TARGET_LONG_EDGE_PX } from './render-config';

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

/**
 * Render scale for a page that is a single full-page image: reproduce the image
 * at its native pixel resolution rather than the default target, bounded by
 * `maxLongEdgePx` so a huge scan cannot allocate an unbounded canvas. Floored at
 * MIN_SCALE so a low-resolution image is never upscaled.
 */
export function singleImageScale(
  pageLongEdgePt: number,
  imageLongEdgePx: number,
  opts?: { maxLongEdgePx?: number },
): number {
  if (!(pageLongEdgePt > 0) || !(imageLongEdgePx > 0)) {
    return MIN_SCALE;
  }
  const targetPx = Math.min(imageLongEdgePx, opts?.maxLongEdgePx ?? NATIVE_MAX_LONG_EDGE_PX);
  return Math.max(MIN_SCALE, targetPx / pageLongEdgePt);
}

export interface ScaleInput {
  readonly singleFullPageImage: boolean;
  readonly imageLongEdgePx?: number;
  readonly widthPt: number;
  readonly heightPt: number;
}

/**
 * Pick the render scale for an analyzed page: a single full-page image renders at
 * its native resolution, every other page at the default target. This is the v1
 * render policy (spec §3.2 note), kept pure so it is testable without a worker.
 */
export function chooseScale(input: ScaleInput): number {
  return input.singleFullPageImage && input.imageLongEdgePx !== undefined
    ? singleImageScale(Math.max(input.widthPt, input.heightPt), input.imageLongEdgePx)
    : renderScale(input.widthPt, input.heightPt);
}
