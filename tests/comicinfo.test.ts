// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { buildComicInfoXml } from '../src/core/comicinfo';
import type { ComicMetadata } from '../src/core/pdf-metadata';

const base: ComicMetadata = { notes: 'Converted from PDF by pdf-to-cbz' };

function parse(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

function text(doc: Document, tag: string): string | null {
  return doc.querySelector(tag)?.textContent ?? null;
}

describe('buildComicInfoXml', () => {
  it('produces well-formed XML rooted at ComicInfo', () => {
    const doc = parse(buildComicInfoXml({ ...base, title: 'Hi' }, 3));
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.documentElement.nodeName).toBe('ComicInfo');
  });

  it('includes PageCount and a FrontCover page for the first image', () => {
    const doc = parse(buildComicInfoXml(base, 5));
    expect(text(doc, 'PageCount')).toBe('5');
    const page = doc.querySelector('Pages > Page');
    expect(page?.getAttribute('Image')).toBe('0');
    expect(page?.getAttribute('Type')).toBe('FrontCover');
  });

  it('omits absent fields rather than emitting empty tags', () => {
    const doc = parse(buildComicInfoXml(base, 2));
    expect(doc.querySelector('Title')).toBeNull();
    expect(doc.querySelector('Writer')).toBeNull();
    expect(doc.querySelector('Year')).toBeNull();
  });

  it('escapes XML metacharacters in values', () => {
    const doc = parse(buildComicInfoXml({ ...base, title: 'A & B <c> "d" \'e\'' }, 1));
    expect(text(doc, 'Title')).toBe('A & B <c> "d" \'e\'');
  });

  it('omits the Pages element when no pages were written', () => {
    const doc = parse(buildComicInfoXml(base, 0));
    expect(doc.querySelector('Pages')).toBeNull();
    expect(text(doc, 'PageCount')).toBe('0');
  });

  it('emits elements in ComicInfo.xsd order', () => {
    const xml = buildComicInfoXml(
      { title: 'T', summary: 'S', notes: 'N', year: 2026, writer: 'W', languageISO: 'en' },
      4,
    );
    const order = ['Title', 'Summary', 'Notes', 'Year', 'Writer', 'PageCount', 'LanguageISO'];
    const positions = order.map((tag) => xml.indexOf(`<${tag}>`));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
