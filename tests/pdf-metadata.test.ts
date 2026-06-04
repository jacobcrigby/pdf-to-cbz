// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { parsePdfDate, toComicMetadata } from '../src/core/pdf-metadata';

describe('parsePdfDate', () => {
  it('parses a full PDF date string with prefix and zone', () => {
    expect(parsePdfDate("D:20260603142530+02'00'")).toEqual({ year: 2026, month: 6, day: 3 });
  });

  it('parses a bare YYYYMMDD without the D: prefix', () => {
    expect(parsePdfDate('20240115')).toEqual({ year: 2024, month: 1, day: 15 });
  });

  it('returns undefined for missing or unparseable input', () => {
    expect(parsePdfDate(undefined)).toBeUndefined();
    expect(parsePdfDate('')).toBeUndefined();
    expect(parsePdfDate('not a date')).toBeUndefined();
    expect(parsePdfDate('D:2026')).toBeUndefined();
  });

  it('rejects out-of-range month or day', () => {
    expect(parsePdfDate('D:20261303')).toBeUndefined();
    expect(parsePdfDate('D:20260632')).toBeUndefined();
  });
});

describe('toComicMetadata', () => {
  it('maps PDF fields onto ComicInfo metadata', () => {
    const meta = toComicMetadata(
      {
        title: 'My Zine',
        author: 'A. Writer',
        subject: 'A summary',
        creationDate: 'D:20260603000000Z',
        language: 'en',
      },
      { fallbackTitle: 'ignored' },
    );
    expect(meta).toEqual({
      title: 'My Zine',
      writer: 'A. Writer',
      summary: 'A summary',
      year: '2026',
      month: '6',
      day: '3',
      languageISO: 'en',
    });
  });

  it('falls back to the given title when the PDF has none', () => {
    const meta = toComicMetadata({ author: 'X' }, { fallbackTitle: 'From Filename' });
    expect(meta.title).toBe('From Filename');
  });

  it('omits absent fields entirely', () => {
    const meta = toComicMetadata({}, { fallbackTitle: '' });
    expect(meta).toEqual({});
    expect('writer' in meta).toBe(false);
    expect('year' in meta).toBe(false);
  });

  it('treats whitespace-only values as absent', () => {
    const meta = toComicMetadata({ author: '   ', subject: '' }, { fallbackTitle: 'T' });
    expect('writer' in meta).toBe(false);
    expect('summary' in meta).toBe(false);
  });
});
