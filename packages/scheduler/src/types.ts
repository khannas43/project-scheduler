/**
 * Minutes since the Unix epoch, UTC. No `Date` objects inside this package
 * (§1.2) — every timestamp the engine touches is one of these, and every
 * operation on it is integer arithmetic. Conversion to/from `Date` happens
 * only at the boundary, outside this package.
 */
export type EpochMinutes = number & { readonly __brand: 'EpochMinutes' };

/** The one place a plain number becomes an EpochMinutes — a typed cast, no runtime work. */
export function asEpochMinutes(value: number): EpochMinutes {
  return value as EpochMinutes;
}

export const MINUTES_PER_DAY = 1440;

/**
 * Branded identifiers (§12.1) — prevents passing a task ID where a calendar
 * ID belongs. Both brand a `string` since the database uses uuid PKs.
 */
export type TaskId = string & { readonly __brand: 'TaskId' };
export type CalendarId = string & { readonly __brand: 'CalendarId' };

export function asTaskId(value: string): TaskId {
  return value as TaskId;
}

export function asCalendarId(value: string): CalendarId {
  return value as CalendarId;
}
