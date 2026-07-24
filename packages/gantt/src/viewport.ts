import { OVERSCAN, ROW_HEIGHT } from './constants.js';

export { OVERSCAN, ROW_HEIGHT } from './constants.js';

export interface VisibleRowRangeInput {
  readonly scrollTop: number;
  readonly viewportHeight: number;
  readonly taskCount: number;
  readonly rowHeight?: number;
  readonly overscan?: number;
}

export interface VisibleRowRange {
  /** Inclusive start index into the task list. */
  readonly start: number;
  /** Exclusive end index into the task list. */
  readonly end: number;
}

/**
 * Viewport row virtualisation (§8.3) — exact slice-index math from the design doc:
 *
 * ```
 * const first = Math.floor(scrollTop / ROW_HEIGHT);
 * const last  = Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT);
 * const visible = tasks.slice(
 *   Math.max(0, first - OVERSCAN),
 *   Math.min(tasks.length, last + OVERSCAN),
 * );
 * ```
 */
export function visibleRowRange(input: VisibleRowRangeInput): VisibleRowRange {
  const rowHeight = input.rowHeight ?? ROW_HEIGHT;
  const overscan = input.overscan ?? OVERSCAN;
  const { scrollTop, viewportHeight, taskCount } = input;

  const first = Math.floor(scrollTop / rowHeight);
  const last = Math.ceil((scrollTop + viewportHeight) / rowHeight);

  return {
    start: Math.max(0, first - overscan),
    end: Math.min(taskCount, last + overscan),
  };
}

/** Horizontal culling: true when [barStart, barEnd] overlaps [windowStart, windowEnd]. */
export function isBarInTimeWindow(
  barStart: number,
  barEnd: number,
  windowStart: number,
  windowEnd: number,
): boolean {
  return barEnd >= windowStart && barStart <= windowEnd;
}

export function minutesToX(minutes: number, scrollLeft: number, pixelsPerMinute: number): number {
  return minutes * pixelsPerMinute - scrollLeft;
}

export function xToMinutes(x: number, scrollLeft: number, pixelsPerMinute: number): number {
  return (x + scrollLeft) / pixelsPerMinute;
}
