// SPDX-License-Identifier: AGPL-3.0-or-later

// A soft, non-blocking heads-up shown before conversion (spec §8 / D8 defaults): a
// large PDF takes a while, and without streaming delivery the whole archive is held
// in memory, which can exhaust a phone. This is a warning, never a hard cap.

const LARGE_FILE_BYTES = 200 * 1024 * 1024;
const MANY_PAGES = 400;

export interface InputWarningInput {
  readonly fileSizeBytes: number;
  readonly pageCount: number;
  // True when the archive streams to disk (File System Access) rather than being
  // buffered in memory for a Blob download.
  readonly streamingDelivery: boolean;
}

/** A warning to surface for a large input, or undefined when none is warranted. */
export function inputWarning({
  fileSizeBytes,
  pageCount,
  streamingDelivery,
}: InputWarningInput): string | undefined {
  if (fileSizeBytes < LARGE_FILE_BYTES && pageCount < MANY_PAGES) {
    return undefined;
  }
  const megabytes = Math.round(fileSizeBytes / (1024 * 1024));
  const base = `Large PDF (${pageCount} pages, ${megabytes} MB); conversion may take a while.`;
  if (!streamingDelivery) {
    return `${base} This browser can't stream to disk, so the whole archive is held in memory and may run out on a file this big.`;
  }
  return base;
}
