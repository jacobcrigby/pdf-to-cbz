// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ComicMetadata } from './pdf-metadata';

// Marking the first image as the cover lets readers use it for the thumbnail.
const FRONT_COVER = '<Page Image="0" Type="FrontCover" />';

/** Serialize ComicInfo.xml with present fields only, in ComicInfo.xsd element order. */
export function buildComicInfoXml(meta: ComicMetadata, pageCount: number): string {
  // ComicInfo.xsd is an ordered sequence; strict validators reject out-of-order elements.
  const elements: ReadonlyArray<readonly [string, string | number | undefined]> = [
    ['Title', meta.title],
    ['Series', meta.series],
    ['Number', meta.number],
    ['Count', meta.count],
    ['Volume', meta.volume],
    ['Summary', meta.summary],
    ['Notes', meta.notes],
    ['Year', meta.year],
    ['Month', meta.month],
    ['Day', meta.day],
    ['Writer', meta.writer],
    ['Penciller', meta.penciller],
    ['Inker', meta.inker],
    ['Colorist', meta.colorist],
    ['Letterer', meta.letterer],
    ['CoverArtist', meta.coverArtist],
    ['Editor', meta.editor],
    ['Publisher', meta.publisher],
    ['Genre', meta.genre],
    ['Tags', meta.tags],
    ['Web', meta.web],
    ['PageCount', pageCount],
    ['LanguageISO', meta.languageISO],
    ['Manga', meta.manga],
    ['AgeRating', meta.ageRating],
  ];

  const body = elements
    .filter((entry): entry is readonly [string, string | number] => entry[1] !== undefined)
    .map(([tag, value]) => `  <${tag}>${escapeXml(String(value))}</${tag}>`);

  if (pageCount > 0) {
    body.push(`  <Pages>\n    ${FRONT_COVER}\n  </Pages>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<ComicInfo>\n${body.join('\n')}\n</ComicInfo>\n`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
