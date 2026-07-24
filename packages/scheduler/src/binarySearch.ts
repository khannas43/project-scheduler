/**
 * Smallest index `i` in `[0, sorted.length)` such that `sorted[i] >= target`,
 * or `sorted.length` if no such index exists. `sorted` must be non-decreasing.
 * O(log n) — the whole reason CompiledCalendar exists (§4.2).
 */
export function lowerBound(sorted: Int32Array, target: number): number {
  let low = 0;
  let high = sorted.length;

  while (low < high) {
    const mid = (low + high) >>> 1;
    const value = sorted[mid];
    if (value !== undefined && value < target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

/**
 * Smallest index `i` in `[0, sorted.length)` such that `sorted[i] > target`,
 * or `sorted.length` if no such index exists. `sorted` must be non-decreasing.
 * The counterpart to lowerBound needed for subtractWorkingMinutes (§4.5): it
 * resolves a target that falls in a plateau (a run of equal values, i.e. a
 * gap of non-working time) to the *end* of the plateau rather than the start.
 */
export function upperBound(sorted: Int32Array, target: number): number {
  let low = 0;
  let high = sorted.length;

  while (low < high) {
    const mid = (low + high) >>> 1;
    const value = sorted[mid];
    if (value !== undefined && value <= target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}
