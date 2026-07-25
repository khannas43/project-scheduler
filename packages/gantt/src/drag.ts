import { MINUTES_PER_DAY } from './constants.js';

/** Snap a project-relative start offset to the nearest whole-day boundary. */
export function snapMinutesToDay(minutes: number): number {
  return Math.round(minutes / MINUTES_PER_DAY) * MINUTES_PER_DAY;
}
