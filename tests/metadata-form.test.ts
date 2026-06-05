// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import type { ComicMetadata } from '../src/core/pdf-metadata';
import {
  createMetadataForm,
  dateValueToParts,
  loadLastUsed,
  mergePrefill,
  partsToDateValue,
  persistableFields,
  saveLastUsed,
} from '../src/ui/metadata-form';

describe('mergePrefill', () => {
  it('prefers PDF-derived values and falls back to last-used', () => {
    const merged = mergePrefill(
      { title: 'From PDF', year: '2026' },
      { title: 'Old', series: 'My Series', writer: 'W' },
    );
    expect(merged.title).toBe('From PDF'); // PDF wins
    expect(merged.series).toBe('My Series'); // only in last-used
    expect(merged.writer).toBe('W');
    expect(merged.year).toBe('2026');
  });

  it('drops empty values', () => {
    expect(mergePrefill({ title: '' }, {})).toEqual({});
  });
});

describe('persistableFields', () => {
  it('keeps series-level fields and drops per-issue ones', () => {
    const kept = persistableFields({
      title: 'Issue One',
      number: '1',
      series: 'My Series',
      publisher: 'Acme',
      notes: 'x',
    });
    expect(kept).toEqual({ series: 'My Series', publisher: 'Acme' });
    expect('title' in kept).toBe(false);
    expect('number' in kept).toBe(false);
  });
});

describe('publication date <-> ComicInfo parts', () => {
  it('combines year/month/day into a zero-padded date input value', () => {
    expect(partsToDateValue('2026', '6', '5')).toBe('2026-06-05');
    expect(partsToDateValue('2026', '12', '31')).toBe('2026-12-31');
  });

  it('returns empty when any part is missing', () => {
    expect(partsToDateValue('2026', undefined, '5')).toBe('');
    expect(partsToDateValue(undefined, undefined, undefined)).toBe('');
  });

  it('parses a date input value back into numeric parts', () => {
    expect(dateValueToParts('2026-06-05')).toEqual({ year: 2026, month: 6, day: 5 });
  });

  it('round-trips through ComicInfo string parts without leading zeros', () => {
    const parts = dateValueToParts('2026-06-05');
    expect(
      parts && partsToDateValue(String(parts.year), String(parts.month), String(parts.day)),
    ).toBe('2026-06-05');
  });

  it('rejects malformed values', () => {
    expect(dateValueToParts('')).toBeUndefined();
    expect(dateValueToParts('2026-6-5')).toBeUndefined();
    expect(dateValueToParts('not a date')).toBeUndefined();
  });
});

describe('form rendering and round-trip', () => {
  it('renders a date picker and selects, prefills, and reads values back', () => {
    const container = document.createElement('section');
    let converted: ComicMetadata | undefined;
    const form = createMetadataForm(container, {
      onConvert: (metadata) => (converted = metadata),
      onCancel: () => undefined,
    });

    const date = container.querySelector<HTMLInputElement>('#meta-publication-date');
    const manga = container.querySelector<HTMLSelectElement>('#meta-manga');
    const ageRating = container.querySelector<HTMLSelectElement>('#meta-ageRating');
    expect(date?.type).toBe('date');
    expect(manga?.tagName).toBe('SELECT');
    expect(ageRating?.tagName).toBe('SELECT');

    form.show({
      title: 'Issue One',
      year: '2026',
      month: '6',
      day: '5',
      manga: 'YesAndRightToLeft',
    });
    expect(date?.value).toBe('2026-06-05');
    expect(manga?.value).toBe('YesAndRightToLeft');

    container.querySelector('form')?.dispatchEvent(new Event('submit'));
    expect(converted?.title).toBe('Issue One');
    expect(converted?.year).toBe('2026');
    expect(converted?.month).toBe('6');
    expect(converted?.day).toBe('5');
    expect(converted?.manga).toBe('YesAndRightToLeft');
  });

  it('fans the single Artist field out to every art-credit role', () => {
    const container = document.createElement('section');
    let converted: ComicMetadata | undefined;
    const form = createMetadataForm(container, {
      onConvert: (metadata) => (converted = metadata),
      onCancel: () => undefined,
    });

    const artist = container.querySelector<HTMLInputElement>('#meta-artist');
    expect(artist?.tagName).toBe('INPUT');

    // Last-used persisted each art role under its own key; the one input prefills from them.
    form.show({ penciller: 'Sam Zine', inker: 'Sam Zine', coverArtist: 'Sam Zine' });
    expect(artist?.value).toBe('Sam Zine');

    artist!.value = 'Alex Maker';
    container.querySelector('form')?.dispatchEvent(new Event('submit'));
    expect(converted?.penciller).toBe('Alex Maker');
    expect(converted?.inker).toBe('Alex Maker');
    expect(converted?.colorist).toBe('Alex Maker');
    expect(converted?.letterer).toBe('Alex Maker');
    expect(converted?.coverArtist).toBe('Alex Maker');
  });

  it('shows a language by name and stores its ISO code', () => {
    const container = document.createElement('section');
    let converted: ComicMetadata | undefined;
    const form = createMetadataForm(container, {
      onConvert: (metadata) => (converted = metadata),
      onCancel: () => undefined,
    });

    const language = container.querySelector<HTMLSelectElement>('#meta-languageISO');
    expect(language?.tagName).toBe('SELECT');
    expect(language?.querySelector('option[value="ja"]')?.textContent).toBe('Japanese');

    // An unlisted prefilled tag is added on the fly rather than dropped.
    form.show({ languageISO: 'en-GB' });
    expect(language?.value).toBe('en-GB');

    language!.value = 'ja';
    container.querySelector('form')?.dispatchEvent(new Event('submit'));
    expect(converted?.languageISO).toBe('ja');
  });
});

describe('save/load round-trip', () => {
  beforeEach(() => localStorage.clear());

  it('persists only the carry-over fields and reloads them', () => {
    saveLastUsed({ title: 'One', series: 'My Series', genre: 'Indie' });
    expect(loadLastUsed()).toEqual({ series: 'My Series', genre: 'Indie' });
  });

  it('returns an empty object when nothing is stored', () => {
    expect(loadLastUsed()).toEqual({});
  });
});
