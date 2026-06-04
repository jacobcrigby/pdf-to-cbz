// SPDX-License-Identifier: AGPL-3.0-or-later

const PROVENANCE = 'Converted from PDF by pdf-to-cbz';

/** Document fields read from a PDF, as plain strings before any normalization. */
export interface RawPdfMetadata {
  readonly title?: string | undefined;
  readonly author?: string | undefined;
  readonly subject?: string | undefined;
  readonly creationDate?: string | undefined;
  readonly language?: string | undefined;
}

/**
 * Metadata shaped for ComicInfo.xml — every field a trimmed string (or absent).
 * The user form fills these; only `title`/`writer`/`summary`/dates/`languageISO`
 * are PDF-derivable, the rest come from the form or persisted last-used values.
 */
export interface ComicMetadata {
  readonly title?: string;
  readonly series?: string;
  readonly number?: string;
  readonly count?: string;
  readonly volume?: string;
  readonly summary?: string;
  readonly notes?: string;
  readonly year?: string;
  readonly month?: string;
  readonly day?: string;
  readonly writer?: string;
  readonly penciller?: string;
  readonly inker?: string;
  readonly colorist?: string;
  readonly letterer?: string;
  readonly coverArtist?: string;
  readonly editor?: string;
  readonly publisher?: string;
  readonly genre?: string;
  readonly tags?: string;
  readonly web?: string;
  readonly languageISO?: string;
  readonly manga?: string;
  readonly ageRating?: string;
}

export const PROVENANCE_NOTE = PROVENANCE;

export interface PdfDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

// PDF dates are `D:YYYYMMDDHHmmSS...` (PDF 32000-1 §7.9.4); the `D:` prefix and the
// time/zone tail are optional in the wild, so only the leading date is required.
const PDF_DATE = /^(?:D:)?(\d{4})(\d{2})(\d{2})/;

/** Extract calendar parts from a PDF date string, or undefined if absent/invalid. */
export function parsePdfDate(raw: string | undefined): PdfDateParts | undefined {
  if (!raw) {
    return undefined;
  }
  const match = PDF_DATE.exec(raw.trim());
  if (!match) {
    return undefined;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined;
  }
  return { year, month, day };
}

/** Map raw PDF fields onto ComicInfo metadata, falling back to `fallbackTitle`. */
export function toComicMetadata(
  raw: RawPdfMetadata,
  opts: { fallbackTitle: string },
): ComicMetadata {
  const date = parsePdfDate(raw.creationDate);
  return {
    ...optional('title', clean(raw.title) ?? clean(opts.fallbackTitle)),
    ...optional('writer', clean(raw.author)),
    ...optional('summary', clean(raw.subject)),
    ...optional('year', date ? String(date.year) : undefined),
    ...optional('month', date ? String(date.month) : undefined),
    ...optional('day', date ? String(date.day) : undefined),
    ...optional('languageISO', clean(raw.language)),
  };
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

// Spread an entry only when it has a value, so absent fields stay off the object
// (and out of ComicInfo.xml) rather than appearing as undefined.
function optional<K extends string, V>(key: K, value: V | undefined): Record<K, V> | object {
  return value === undefined ? {} : { [key]: value };
}
