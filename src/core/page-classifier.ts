// SPDX-License-Identifier: AGPL-3.0-or-later

/** A neutral summary of a page's drawing operators, free of pdf.js specifics. */
export interface PageOpSummary {
  readonly imagePaintCount: number;
  // Text, path, and mask/repeat-image operators — anything that means the page is
  // more than one plain full-page image.
  readonly disqualifyingOpCount: number;
}

/**
 * A page counts as a single full-page image when exactly one image is painted and
 * nothing else is drawn. Such pages render at the image's native resolution; a
 * misclassification only changes the chosen scale, never the rendered output.
 */
export function isSingleFullPageImage(summary: PageOpSummary): boolean {
  return summary.imagePaintCount === 1 && summary.disqualifyingOpCount === 0;
}
