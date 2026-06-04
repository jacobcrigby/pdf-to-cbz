// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadLastUsed,
  mergePrefill,
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
