// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { padPageName, toOutputFilename } from '../src/core/naming';

describe('padPageName', () => {
  it('zero-pads to width 4 for documents under 1000 pages', () => {
    expect(padPageName(0, 12, 'webp')).toBe('0001.webp');
    expect(padPageName(11, 12, 'jpg')).toBe('0012.jpg');
  });

  it('stays width 4 at exactly 1000 pages', () => {
    expect(padPageName(0, 1000, 'webp')).toBe('0001.webp');
    expect(padPageName(999, 1000, 'webp')).toBe('1000.webp');
  });

  it('widens past width 4 when the page count needs more digits', () => {
    expect(padPageName(0, 10000, 'webp')).toBe('00001.webp');
    expect(padPageName(9999, 12345, 'jpg')).toBe('10000.jpg');
  });
});

describe('toOutputFilename', () => {
  it('strips a trailing .pdf case-insensitively and appends .cbz', () => {
    expect(toOutputFilename('My Comic.pdf')).toBe('My Comic.cbz');
    expect(toOutputFilename('My Comic.PDF')).toBe('My Comic.cbz');
    expect(toOutputFilename('a.Pdf')).toBe('a.cbz');
  });

  it('only strips the trailing .pdf, not an internal one', () => {
    expect(toOutputFilename('re.pdf.summary.pdf')).toBe('re.pdf.summary.cbz');
  });

  it('removes every illegal filesystem character', () => {
    for (const char of ['/', '\\', ':', '*', '?', '"', '<', '>', '|']) {
      expect(toOutputFilename(`a${char}b.pdf`)).toBe('ab.cbz');
    }
  });

  it('collapses whitespace runs and trims', () => {
    expect(toOutputFilename('  a   b  .pdf')).toBe('a b.cbz');
  });

  it('falls back to comic when nothing usable remains', () => {
    expect(toOutputFilename('///.pdf')).toBe('comic.cbz');
    expect(toOutputFilename('   .pdf')).toBe('comic.cbz');
    expect(toOutputFilename('')).toBe('comic.cbz');
  });

  it('appends .cbz to a name that has no extension', () => {
    expect(toOutputFilename('comic')).toBe('comic.cbz');
  });

  it('preserves unicode characters that are legal in filenames', () => {
    expect(toOutputFilename('漫画.pdf')).toBe('漫画.cbz');
  });
});
