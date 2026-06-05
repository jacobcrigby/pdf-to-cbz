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

// Total budget for the per-worker PDF copies. Since a large PDF must reduce the worker
// count to keep copies bounded.
const PDF_COPY_BUDGET_BYTES = 256 * 1024 * 1024;

// Each worker holds the source twice: the pdf.js document plus a second copy kept for
// the structure parser that recovers original image bytes. Both scale with PDF size.
const PDF_COPIES_PER_WORKER = 2;

/** Render-worker count for the measured runtime and PDF, clamped to [1, POOL_MAX]. */
export function poolSize(
  capabilities: { hardwareConcurrency: number; deviceMemory: number },
  pdfBytes: number,
): number {
  const byCores = Math.floor(capabilities.hardwareConcurrency);
  const byMemory = Math.floor(capabilities.deviceMemory / GIB_PER_WORKER);
  const byPdf =
    pdfBytes > 0
      ? Math.floor(PDF_COPY_BUDGET_BYTES / (pdfBytes * PDF_COPIES_PER_WORKER))
      : POOL_MAX;
  return Math.max(1, Math.min(POOL_MAX, byCores, byMemory, byPdf));
}
