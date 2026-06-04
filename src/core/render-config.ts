// SPDX-License-Identifier: AGPL-3.0-or-later

// Render tuning is build-time configurable through Vite env vars so output
// resolution and size can be adjusted without touching code. An out-of-range or
// non-numeric override falls back to the default rather than rendering garbage.

const DEFAULT_TARGET_LONG_EDGE_PX = 1600;
const DEFAULT_MAX_SCALE = 2.0;
const DEFAULT_ENCODE_QUALITY = 0.8;

function positiveOr(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return raw !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

// Canvas encoders treat quality as a fraction; values outside (0, 1] are meaningless.
function unitFractionOr(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return raw !== undefined && Number.isFinite(value) && value > 0 && value <= 1 ? value : fallback;
}

export const TARGET_LONG_EDGE_PX = positiveOr(
  import.meta.env.VITE_TARGET_LONG_EDGE_PX,
  DEFAULT_TARGET_LONG_EDGE_PX,
);
export const MAX_SCALE = positiveOr(import.meta.env.VITE_MAX_SCALE, DEFAULT_MAX_SCALE);
export const ENCODE_QUALITY = unitFractionOr(
  import.meta.env.VITE_ENCODE_QUALITY,
  DEFAULT_ENCODE_QUALITY,
);
