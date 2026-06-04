// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { createPageScheduler } from '../src/core/page-scheduler';

describe('createPageScheduler', () => {
  it('dispatches only within the window until pages are emitted', () => {
    const s = createPageScheduler(10, 3);
    expect(s.next()).toBe(0);
    expect(s.next()).toBe(1);
    expect(s.next()).toBe(2);
    expect(s.next()).toBeUndefined(); // window full (3 dispatched, 0 emitted)
    s.settle(0, true);
    expect(s.next()).toBe(3); // window advanced by one emit
  });

  it('buffers out-of-order results and flushes them in reading order', () => {
    const s = createPageScheduler(3, 3);
    s.next();
    s.next();
    s.next();
    expect(s.settle(2, true)).toEqual([]); // 0 and 1 not settled yet
    expect(s.settle(1, true)).toEqual([]);
    expect(s.settle(0, true)).toEqual([
      { index: 0, ok: true },
      { index: 1, ok: true },
      { index: 2, ok: true },
    ]);
  });

  it('preserves skip results in order', () => {
    const s = createPageScheduler(2, 2);
    s.next();
    s.next();
    expect(s.settle(0, false)).toEqual([{ index: 0, ok: false }]);
    expect(s.settle(1, true)).toEqual([{ index: 1, ok: true }]);
  });

  it('reports done only once every page has settled', () => {
    const s = createPageScheduler(2, 2);
    s.next();
    s.next();
    s.settle(1, true);
    expect(s.done).toBe(false);
    s.settle(0, true);
    expect(s.done).toBe(true);
  });

  it('stops dispatching past the last page', () => {
    const s = createPageScheduler(1, 4);
    expect(s.next()).toBe(0);
    expect(s.next()).toBeUndefined();
  });
});
