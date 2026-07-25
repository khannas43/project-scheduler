/** Shared layout constants for the Gantt prototype (§8). */
export const ROW_HEIGHT = 28;
export const OVERSCAN = 5;
export const BAR_HEIGHT = 18;
export const BAR_VPAD = (ROW_HEIGHT - BAR_HEIGHT) / 2;

/** Pixels per day on the default timescale. */
export const PIXELS_PER_DAY = 24;

/** Minutes in a day — synthetic times are day-relative minutes. */
export const MINUTES_PER_DAY = 24 * 60;

/** Pixel hit-slop for the right-edge resize handle (left-edge resize is out of scope). */
export const RESIZE_EDGE_PX = 6;
