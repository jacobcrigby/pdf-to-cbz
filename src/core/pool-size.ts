// SPDX-License-Identifier: AGPL-3.0-or-later

// A bounded pool keeps peak memory predictable; converges to a single worker on
// weak devices. Each worker holds its own PDF copy (no SharedArrayBuffer on a
// static host), so memory — not just cores — caps the count.
export const POOL_MAX = 4;

// Rough headroom budget per worker (a PDF copy plus a pdf.js instance), in GiB.
const GIB_PER_WORKER = 2;

/** Render-worker count for the measured runtime, clamped to [1, POOL_MAX]. */
export function poolSize(capabilities: {
  hardwareConcurrency: number;
  deviceMemory: number;
}): number {
  const byCores = Math.floor(capabilities.hardwareConcurrency);
  const byMemory = Math.floor(capabilities.deviceMemory / GIB_PER_WORKER);
  return Math.max(1, Math.min(POOL_MAX, byCores, byMemory));
}
