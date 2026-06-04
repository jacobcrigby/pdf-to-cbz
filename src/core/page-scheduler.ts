// SPDX-License-Identifier: AGPL-3.0-or-later

/** A page that has finished rendering, surfaced in reading order. `ok: false` = skipped. */
export interface SettledPage {
  readonly index: number;
  readonly ok: boolean;
}

export interface PageScheduler {
  /** Next page index to dispatch, or undefined when the window is full or all are out. */
  next(): number | undefined;
  /** Record a settled page; returns pages now flushable in reading order. */
  settle(index: number, ok: boolean): readonly SettledPage[];
  /** True once every page has been dispatched and settled. */
  readonly done: boolean;
}

/**
 * Hands out page indices to a worker pool and reassembles results in reading order.
 * Pages render out of order across workers, so a result is buffered until every
 * earlier page has settled. The window bounds how far dispatch may run ahead of the
 * next page to emit, capping the pages in flight (and thus peak memory) regardless
 * of page count.
 */
export function createPageScheduler(pageCount: number, windowSize: number): PageScheduler {
  const settled = new Map<number, boolean>();
  let nextDispatch = 0;
  let nextEmit = 0;
  let settledCount = 0;

  return {
    next() {
      if (nextDispatch >= pageCount || nextDispatch - nextEmit >= windowSize) {
        return undefined;
      }
      const index = nextDispatch;
      nextDispatch += 1;
      return index;
    },
    settle(index, ok) {
      settled.set(index, ok);
      settledCount += 1;
      const flushed: SettledPage[] = [];
      let value = settled.get(nextEmit);
      while (value !== undefined) {
        flushed.push({ index: nextEmit, ok: value });
        settled.delete(nextEmit);
        nextEmit += 1;
        value = settled.get(nextEmit);
      }
      return flushed;
    },
    get done() {
      return settledCount === pageCount;
    },
  };
}
