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
