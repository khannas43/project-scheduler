import type { CalendarExceptionInput } from './calendar.js';
import { asEpochMinutes, MINUTES_PER_DAY, type EpochMinutes } from './types.js';

export interface RawCalendarException {
  /** Anchor date; month/day matters for recurrence, year doesn't. */
  readonly date: EpochMinutes;
  readonly isWorking: boolean;
  readonly startMinute?: number;
  readonly finishMinute?: number;
  readonly recurrence?: { readonly type: 'annual' } | null;
}

interface CivilDate {
  readonly year: number;
  readonly month: number; // 1..12
  readonly day: number; // 1..31
}

/**
 * Days since Unix epoch (1970-01-01) → proleptic Gregorian Y/M/D.
 * Howard Hinnant civil_from_days — pure integer arithmetic, no `Date` (§1.2).
 */
export function civilFromEpochDay(epochDay: number): CivilDate {
  const z = epochDay + 719_468;
  const era = Math.floor((z >= 0 ? z : z - 146_096) / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365);
  let y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100) + Math.floor(yoe / 400));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  y = month <= 2 ? y + 1 : y;
  return { year: y, month, day };
}

/**
 * Proleptic Gregorian Y/M/D → days since Unix epoch (1970-01-01).
 * Howard Hinnant days_from_civil — pure integer arithmetic, no `Date` (§1.2).
 */
export function epochDayFromCivil(year: number, month: number, day: number): number {
  let y = year;
  y -= month <= 2 ? 1 : 0;
  const era = Math.floor((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month > 2 ? month - 3 : month + 9) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + Math.floor(yoe / 400) + doy;
  return era * 146_097 + doe - 719_468;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function toExceptionInput(
  date: EpochMinutes,
  raw: RawCalendarException,
): CalendarExceptionInput {
  return {
    date,
    isWorking: raw.isWorking,
    ...(raw.startMinute !== undefined ? { startMinute: raw.startMinute } : {}),
    ...(raw.finishMinute !== undefined ? { finishMinute: raw.finishMinute } : {}),
  };
}

function inHorizon(date: number, horizonStart: number, horizonEnd: number): boolean {
  return date >= horizonStart && date < horizonEnd;
}

/**
 * Expand DB-shaped calendar exceptions (with optional annual recurrence) into
 * the flat `CalendarExceptionInput[]` that `compileCalendar` expects.
 *
 * Out-of-horizon one-shots are filtered (not thrown) — `compileCalendar` rejects
 * out-of-range dates, so this is the boundary that keeps the compiler pure.
 *
 * Feb 29 annual anchors: non-leap years are skipped entirely (no shift to
 * Feb 28 / Mar 1).
 */
export function expandRecurringExceptions(
  raw: readonly RawCalendarException[],
  horizonStart: EpochMinutes,
  horizonDays: number,
): CalendarExceptionInput[] {
  if (!Number.isInteger(horizonDays) || horizonDays <= 0) {
    throw new RangeError('horizonDays must be a positive integer');
  }
  if (horizonStart % MINUTES_PER_DAY !== 0) {
    throw new RangeError('horizonStart must be aligned to a day boundary (UTC midnight)');
  }

  const horizonEnd = horizonStart + horizonDays * MINUTES_PER_DAY;
  const result: CalendarExceptionInput[] = [];

  for (const ex of raw) {
    if (ex.recurrence?.type === 'annual') {
      const anchor = civilFromEpochDay(ex.date / MINUTES_PER_DAY);
      const firstDay = civilFromEpochDay(horizonStart / MINUTES_PER_DAY);
      const lastDay = civilFromEpochDay((horizonEnd - 1) / MINUTES_PER_DAY);

      for (let year = firstDay.year; year <= lastDay.year; year += 1) {
        if (anchor.month === 2 && anchor.day === 29 && !isLeapYear(year)) {
          continue;
        }
        const date = asEpochMinutes(epochDayFromCivil(year, anchor.month, anchor.day) * MINUTES_PER_DAY);
        if (inHorizon(date, horizonStart, horizonEnd)) {
          result.push(toExceptionInput(date, ex));
        }
      }
      continue;
    }

    if (inHorizon(ex.date, horizonStart, horizonEnd)) {
      result.push(toExceptionInput(asEpochMinutes(ex.date), ex));
    }
  }

  return result;
}
