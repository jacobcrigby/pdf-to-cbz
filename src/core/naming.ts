// SPDX-License-Identifier: AGPL-3.0-or-later

export type PageExt = 'webp' | 'jpg';

// Readers sort pages by filename, so names are zero-padded wide enough that
// lexical order matches numeric (reading) order across the whole archive.
const MIN_NAME_WIDTH = 4;

/** Archive entry name for the 0-based `index` of a `pageCount`-page document. */
export function padPageName(index: number, pageCount: number, ext: PageExt): string {
  const width = Math.max(MIN_NAME_WIDTH, String(pageCount).length);
  return `${String(index + 1).padStart(width, '0')}.${ext}`;
}

// Characters illegal in filenames on common filesystems (Windows is the strictest).
const ILLEGAL_CHARS = /[/\\:*?"<>|]/g;

/** Derive the `.cbz` download name from the source PDF filename. */
export function toOutputFilename(sourceName: string): string {
  const base = sourceName
    .replace(/\.pdf$/i, '')
    .replace(ILLEGAL_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${base || 'comic'}.cbz`;
}
