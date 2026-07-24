import { describe, expect, it } from 'vitest';

import {
  STRIDE,
  buildSpatialIndex,
  hitTest,
  type SpatialBar,
} from '../src/hitTest.js';
import { ROW_HEIGHT } from '../src/viewport.js';

function bar(partial: Partial<SpatialBar> & Pick<SpatialBar, 'taskId' | 'y'>): SpatialBar {
  return {
    x: 10,
    w: 80,
    h: 18,
    ...partial,
  };
}

describe('buildSpatialIndex (§8.4)', () => {
  it('packs [x, y, w, h, taskId] into a flat Float32Array with stride 5', () => {
    const index = buildSpatialIndex([
      bar({ taskId: 3, x: 1, y: 0, w: 2, h: 3 }),
      bar({ taskId: 7, x: 4, y: ROW_HEIGHT, w: 5, h: 6 }),
    ]);
    expect(index).toBeInstanceOf(Float32Array);
    expect(index.length).toBe(2 * STRIDE);
    expect(Array.from(index.slice(0, 5))).toEqual([1, 0, 2, 3, 3]);
    expect(Array.from(index.slice(5, 10))).toEqual([4, ROW_HEIGHT, 5, 6, 7]);
  });

  it('sorts entries by y so binary search by row is valid', () => {
    const index = buildSpatialIndex([
      bar({ taskId: 2, y: 2 * ROW_HEIGHT }),
      bar({ taskId: 0, y: 0 }),
      bar({ taskId: 1, y: ROW_HEIGHT }),
    ]);
    expect(index[1]).toBe(0);
    expect(index[1 + STRIDE]).toBe(ROW_HEIGHT);
    expect(index[1 + 2 * STRIDE]).toBe(2 * ROW_HEIGHT);
    expect(index[4]).toBe(0);
    expect(index[4 + STRIDE]).toBe(1);
    expect(index[4 + 2 * STRIDE]).toBe(2);
  });
});

describe('hitTest (§8.4)', () => {
  const bars: SpatialBar[] = [
    bar({ taskId: 0, x: 100, y: 0, w: 50, h: 18 }),
    bar({ taskId: 1, x: 200, y: ROW_HEIGHT, w: 50, h: 18 }),
    bar({ taskId: 2, x: 150, y: 2 * ROW_HEIGHT, w: 40, h: 18 }),
    // Second bar on the same row as task 1 — linear scan within the row.
    bar({ taskId: 11, x: 300, y: ROW_HEIGHT, w: 20, h: 18 }),
  ];
  const index = buildSpatialIndex(bars);

  it('returns the taskId when the point lies inside a bar', () => {
    expect(hitTest(index, 125, 9)).toBe(0);
    expect(hitTest(index, 220, ROW_HEIGHT + 5)).toBe(1);
    expect(hitTest(index, 160, 2 * ROW_HEIGHT + 5)).toBe(2);
  });

  it('binary-searches to the row then linear-scans sibling bars on that row', () => {
    expect(hitTest(index, 310, ROW_HEIGHT + 5)).toBe(11);
  });

  it('returns a non-index-aligned taskId that must be resolved via a map, not tasks[id]', () => {
    // Mirrors real data: spatial index stores the real id (e.g. 9001), not the row.
    const skewed = buildSpatialIndex([
      bar({ taskId: 9001, x: 100, y: 0, w: 50, h: 18 }),
      bar({ taskId: 42, x: 200, y: ROW_HEIGHT, w: 50, h: 18 }),
    ]);
    expect(hitTest(skewed, 125, 9)).toBe(9001);
    expect(hitTest(skewed, 220, ROW_HEIGHT + 5)).toBe(42);
  });

  it('returns null when the point misses every bar on the row', () => {
    expect(hitTest(index, 10, 9)).toBeNull();
    expect(hitTest(index, 250, ROW_HEIGHT + 5)).toBeNull();
  });

  it('returns null for an empty index', () => {
    expect(hitTest(new Float32Array(0), 0, 0)).toBeNull();
  });

  it('returns null when the pointer is on a row with no indexed bars', () => {
    // Row 50 is far below the indexed rows 0–2.
    expect(hitTest(index, 125, 50 * ROW_HEIGHT + 5)).toBeNull();
  });

  it('is sub-millisecond on a 10k-entry index for a mid-list hit', () => {
    const many: SpatialBar[] = Array.from({ length: 10_000 }, (_, i) =>
      bar({ taskId: i, x: 100, y: i * ROW_HEIGHT, w: 50, h: 18 }),
    );
    const big = buildSpatialIndex(many);
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) {
      expect(hitTest(big, 125, 5000 * ROW_HEIGHT + 5)).toBe(5000);
    }
    const elapsed = performance.now() - t0;
    // 1000 queries ≪ 1s; average well under 1ms each.
    expect(elapsed / 1000).toBeLessThan(1);
  });
});
