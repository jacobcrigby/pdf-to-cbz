// SPDX-License-Identifier: AGPL-3.0-or-later

// Render tuning is build-time configurable through Vite env vars so output
// resolution and size can be adjusted without touching code. An out-of-range or
// non-numeric override falls back to the default rather than rendering garbage.

const DEFAULT_TARGET_LONG_EDGE_PX = 1600;
const DEFAULT_MAX_SCALE = 2.0;
const DEFAULT_ENCODE_QUALITY = 0.8;
const DEFAULT_NATIVE_MAX_LONG_EDGE_PX = 2600;

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

// Upper bound on the long edge when rendering a single full-page image at its
// native resolution, so a high-DPI scan stays sharp without an unbounded canvas.
export const NATIVE_MAX_LONG_EDGE_PX = positiveOr(
  import.meta.env.VITE_NATIVE_MAX_LONG_EDGE_PX,
  DEFAULT_NATIVE_MAX_LONG_EDGE_PX,
);

// Upper bound on the long edge for lossless JPEG byte-passthrough. Passing original
// bytes through preserves full resolution (no native cap), so this defaults to
// unbounded; set it to trade some fidelity for smaller files (a larger image then
// renders, subject to NATIVE_MAX_LONG_EDGE_PX, instead of passing through).
export const EXTRACT_MAX_LONG_EDGE_PX = positiveOr(
  import.meta.env.VITE_EXTRACT_MAX_LONG_EDGE_PX,
  Number.POSITIVE_INFINITY,
);
