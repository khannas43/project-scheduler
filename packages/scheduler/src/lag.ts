import { addWorkingMinutes, subtractWorkingMinutes, type CompiledCalendar } from './calendar.js';
import type { EpochMinutes } from './types.js';

/**
 * When `lagPercent` is non-null it replaces `lagMinutes` entirely — MS Project
 * convention: percentage of the *predecessor's* duration (§13 item 28).
 */
export function resolveLagMinutes(
  lagMinutes: number,
  lagPercent: number | null | undefined,
  predecessorDurationMinutes: number,
): number {
  if (lagPercent != null) {
    return Math.round((predecessorDurationMinutes * lagPercent) / 100);
  }
  return lagMinutes;
}

/** Apply a signed lag forward from a schedule point (forward pass). */
export function applyLag(point: EpochMinutes, lagMinutes: number, calendar: CompiledCalendar): EpochMinutes {
  if (lagMinutes === 0) return point;
  return lagMinutes > 0
    ? addWorkingMinutes(point, lagMinutes, calendar)
    : subtractWorkingMinutes(point, -lagMinutes, calendar);
}

/**
 * Undo a signed lag when walking backward from a successor constraint to a
 * predecessor candidate (backward pass).
 */
export function unapplyLag(point: EpochMinutes, lagMinutes: number, calendar: CompiledCalendar): EpochMinutes {
  if (lagMinutes === 0) return point;
  return lagMinutes > 0
    ? subtractWorkingMinutes(point, lagMinutes, calendar)
    : addWorkingMinutes(point, -lagMinutes, calendar);
}
