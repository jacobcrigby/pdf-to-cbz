// SPDX-License-Identifier: AGPL-3.0-or-later

// A bounded pool keeps peak memory predictable; converges to a single worker on
// weak devices. Each worker holds its own PDF copy (no SharedArrayBuffer on a
// static host), so memory — not just cores — caps the count.
export const POOL_MAX = 4;

// Headroom budget per worker, in GiB. A worker holds its own PDF copy, a pdf.js
// instance, and a full-resolution render in flight, so the budget is deliberately
// generous: `deviceMemory` over-reports what a mobile tab can actually use before
// the OS starts killing processes.
const GIB_PER_WORKER = 4;

/** Render-worker count for the measured runtime, clamped to [1, POOL_MAX]. */
export function poolSize(capabilities: {
  hardwareConcurrency: number;
  deviceMemory: number;
}): number {
  const byCores = Math.floor(capabilities.hardwareConcurrency);
  const byMemory = Math.floor(capabilities.deviceMemory / GIB_PER_WORKER);
  return Math.max(1, Math.min(POOL_MAX, byCores, byMemory));
}
