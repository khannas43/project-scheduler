import { describe, expect, it } from 'vitest';

import { OVERSCAN, ROW_HEIGHT, visibleRowRange } from '../src/viewport.js';

describe('visibleRowRange (§8.3)', () => {
  it('matches the documented slice-index math at the top of the list', () => {
    // first = floor(0 / ROW_HEIGHT) = 0
    // last  = ceil((0 + 280) / ROW_HEIGHT) = ceil(10) = 10
    // slice(max(0, 0 - OVERSCAN), min(N, 10 + OVERSCAN))
    const range = visibleRowRange({
      scrollTop: 0,
      viewportHeight: 10 * ROW_HEIGHT,
      taskCount: 10_000,
    });
    expect(range.start).toBe(0);
    expect(range.end).toBe(10 + OVERSCAN);
  });

  it('applies overscan on both sides when scrolled into the middle', () => {
    const scrollTop = 100 * ROW_HEIGHT;
    const viewportHeight = 20 * ROW_HEIGHT;
    const first = Math.floor(scrollTop / ROW_HEIGHT);
    const last = Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT);

    const range = visibleRowRange({ scrollTop, viewportHeight, taskCount: 10_000 });
    expect(range.start).toBe(first - OVERSCAN);
    expect(range.end).toBe(last + OVERSCAN);
    expect(range.start).toBe(100 - OVERSCAN);
    expect(range.end).toBe(120 + OVERSCAN);
  });

  it('clamps the start to 0 near the top', () => {
    const range = visibleRowRange({
      scrollTop: ROW_HEIGHT,
      viewportHeight: 5 * ROW_HEIGHT,
      taskCount: 10_000,
    });
    expect(range.start).toBe(0);
    expect(range.end).toBe(Math.ceil((ROW_HEIGHT + 5 * ROW_HEIGHT) / ROW_HEIGHT) + OVERSCAN);
  });

  it('clamps the end to taskCount near the bottom', () => {
    const taskCount = 50;
    const scrollTop = 45 * ROW_HEIGHT;
    const viewportHeight = 20 * ROW_HEIGHT;
    const range = visibleRowRange({ scrollTop, viewportHeight, taskCount });
    expect(range.end).toBe(taskCount);
    expect(range.start).toBe(Math.max(0, 45 - OVERSCAN));
  });

  it('returns an empty range when taskCount is 0', () => {
    const range = visibleRowRange({
      scrollTop: 0,
      viewportHeight: 500,
      taskCount: 0,
    });
    expect(range.start).toBe(0);
    expect(range.end).toBe(0);
  });

  it('accepts custom rowHeight and overscan', () => {
    const range = visibleRowRange({
      scrollTop: 200,
      viewportHeight: 100,
      taskCount: 1000,
      rowHeight: 20,
      overscan: 2,
    });
    // first = floor(200/20) = 10; last = ceil(300/20) = 15
    expect(range.start).toBe(8);
    expect(range.end).toBe(17);
  });
});
