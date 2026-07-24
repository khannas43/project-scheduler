import { ROW_HEIGHT } from './constants.js';

/** Stride of the flat spatial index: [x, y, w, h, taskId] (§8.4). */
export const STRIDE = 5;

export interface SpatialBar {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly taskId: number;
}

/**
 * Pack bars into a Float32Array sorted by `y` so hit-testing can binary-search
 * by row, then linear-scan that row's bars.
 */
export function buildSpatialIndex(bars: readonly SpatialBar[]): Float32Array {
  const sorted = bars.slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const index = new Float32Array(sorted.length * STRIDE);
  for (let i = 0; i < sorted.length; i++) {
    const bar = sorted[i];
    if (bar === undefined) continue;
    const o = i * STRIDE;
    index[o] = bar.x;
    index[o + 1] = bar.y;
    index[o + 2] = bar.w;
    index[o + 3] = bar.h;
    index[o + 4] = bar.taskId;
  }
  return index;
}

/**
 * Binary-search by row (`y`), then linear-scan bars on that row for a hit.
 * Returns the numeric `taskId`, or `null` if nothing contains `(px, py)`.
 */
export function hitTest(index: Float32Array, px: number, py: number): number | null {
  const count = index.length / STRIDE;
  if (count === 0) return null;

  const targetRow = Math.floor(py / ROW_HEIGHT);
  const rowStart = lowerBoundByRow(index, count, targetRow);
  if (rowStart < 0) return null;

  for (let i = rowStart; i < count; i++) {
    const o = i * STRIDE;
    const y = index[o + 1]!;
    const row = Math.floor(y / ROW_HEIGHT);
    if (row > targetRow) break;
    if (row < targetRow) continue;

    const x = index[o]!;
    const w = index[o + 2]!;
    const h = index[o + 3]!;
    if (px >= x && px < x + w && py >= y && py < y + h) {
      return index[o + 4]!;
    }
  }
  return null;
}

/** First index whose row >= targetRow, or -1 if none. */
function lowerBoundByRow(index: Float32Array, count: number, targetRow: number): number {
  let lo = 0;
  let hi = count;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const y = index[mid * STRIDE + 1]!;
    const row = Math.floor(y / ROW_HEIGHT);
    if (row < targetRow) lo = mid + 1;
    else hi = mid;
  }
  if (lo >= count) return -1;
  const y = index[lo * STRIDE + 1]!;
  if (Math.floor(y / ROW_HEIGHT) !== targetRow) return -1;
  return lo;
}
