/** Shared layout constants for the Gantt prototype (§8). */
export const ROW_HEIGHT = 28;
export const OVERSCAN = 5;
export const BAR_HEIGHT = 18;
export const BAR_VPAD = (ROW_HEIGHT - BAR_HEIGHT) / 2;

/** Sticky timescale header height above the chart body. */
export const HEADER_HEIGHT = 28;

/** Pixels per day on the default (week) timescale. */
export const PIXELS_PER_DAY = 24;

/** Minutes in a day — synthetic times are day-relative minutes. */
export const MINUTES_PER_DAY = 24 * 60;

/** Named horizontal zoom levels for Day / Week / Month views. */
export type GanttTimeScale = 'day' | 'week' | 'month';

/** Pixels allocated to one calendar day at each named scale. */
export const SCALE_PIXELS_PER_DAY: Readonly<Record<GanttTimeScale, number>> = {
  day: 64,
  week: 24,
  month: 6,
};

export function pixelsPerMinuteForScale(scale: GanttTimeScale): number {
  return SCALE_PIXELS_PER_DAY[scale] / MINUTES_PER_DAY;
}

/** Pixel hit-slop for the right-edge resize handle (left-edge resize is out of scope). */
export const RESIZE_EDGE_PX = 6;
