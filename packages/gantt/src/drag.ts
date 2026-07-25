import { MINUTES_PER_DAY } from './constants.js';

/** Snap a project-relative start offset to the nearest whole-day boundary. */
export function snapMinutesToDay(minutes: number): number {
  return Math.round(minutes / MINUTES_PER_DAY) * MINUTES_PER_DAY;
}

/**
 * Snap a duration to whole days and clamp to at least one day
 * (never zero or negative — a drag past the bar start bottoms out at 1 day).
 */
export function snapDurationMinutes(minutes: number): number {
  return Math.max(MINUTES_PER_DAY, snapMinutesToDay(minutes));
}
