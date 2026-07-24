import { lowerBound } from './binarySearch.js';
import { asEpochMinutes, MINUTES_PER_DAY, type EpochMinutes } from './types.js';

/**
 * A one-off override for a single day — a holiday (`isWorking: false`) or an
 * extra working day (`isWorking: true`). Mirrors `calendar_exceptions`
 * (§3.2); the caller is responsible for turning a DB row's `exception_date`
 * into a midnight-aligned EpochMinutes before it gets here.
 *
 * `startMinute`/`finishMinute` are only meaningful when `isWorking` is true;
 * when omitted, the calendar's default hours apply for that day.
 */
export interface CalendarExceptionInput {
  readonly date: EpochMinutes;
  readonly isWorking: boolean;
  readonly startMinute?: number;
  readonly finishMinute?: number;
}

export interface CalendarCompilationInput {
  /** Must be a whole day boundary (UTC midnight) — `horizonStart % MINUTES_PER_DAY === 0`. */
  readonly horizonStart: EpochMinutes;
  /** Number of days to compile, > 0. addWorkingMinutes throws once a result would fall outside this. */
  readonly horizonDays: number;
  /** 0 = Sunday .. 6 = Saturday, mirroring the DB's `working_days smallint[]` (§3.2). */
  readonly workingWeekdays: readonly number[];
  readonly defaultStartMinute: number;
  readonly defaultFinishMinute: number;
  readonly exceptions?: readonly CalendarExceptionInput[];
}

/**
 * §4.2: a working-minute prefix-sum index over a project's date horizon.
 * `slots[d]` is the cumulative working minutes from `horizonStart` through
 * the end of day `d`; `dayStarts[d]` is that day's first working minute
 * (meaningless, and never read, for a day with zero capacity).
 */
export interface CompiledCalendar {
  readonly horizonStart: EpochMinutes;
  readonly slots: Int32Array;
  readonly dayStarts: Int32Array;
}

function dayOfWeek(absoluteDayNumber: number): number {
  // Unix epoch day 0 (1970-01-01) was a Thursday (weekday 4, Sunday=0).
  // Pure integer arithmetic — no Date, per §1.2.
  return ((absoluteDayNumber % 7) + 4 + 7) % 7;
}

export function compileCalendar(input: CalendarCompilationInput): CompiledCalendar {
  const { horizonStart, horizonDays, workingWeekdays, defaultStartMinute, defaultFinishMinute, exceptions } = input;

  if (horizonStart % MINUTES_PER_DAY !== 0) {
    throw new RangeError('horizonStart must be aligned to a day boundary (UTC midnight)');
  }
  if (!Number.isInteger(horizonDays) || horizonDays <= 0) {
    throw new RangeError('horizonDays must be a positive integer');
  }
  if (defaultStartMinute < 0 || defaultFinishMinute > MINUTES_PER_DAY || defaultStartMinute >= defaultFinishMinute) {
    throw new RangeError('defaultStartMinute must be < defaultFinishMinute, within a single day');
  }

  const workingWeekdaySet = new Set(workingWeekdays);
  const exceptionsByDayIndex = new Map<number, CalendarExceptionInput>();
  for (const exception of exceptions ?? []) {
    const offsetMinutes = exception.date - horizonStart;
    if (offsetMinutes % MINUTES_PER_DAY !== 0) {
      throw new RangeError(`exception date ${exception.date} is not aligned to a day boundary`);
    }
    const dayIndex = offsetMinutes / MINUTES_PER_DAY;
    if (dayIndex < 0 || dayIndex >= horizonDays) {
      throw new RangeError(`exception date ${exception.date} falls outside the compiled horizon`);
    }
    if (exception.isWorking) {
      const start = exception.startMinute ?? defaultStartMinute;
      const finish = exception.finishMinute ?? defaultFinishMinute;
      if (start < 0 || finish > MINUTES_PER_DAY || start >= finish) {
        throw new RangeError(`exception on day ${dayIndex} has an invalid start/finish span`);
      }
    }
    exceptionsByDayIndex.set(dayIndex, exception);
  }

  const absoluteStartDay = horizonStart / MINUTES_PER_DAY;
  const slots = new Int32Array(horizonDays);
  const dayStarts = new Int32Array(horizonDays);

  let cumulative = 0;
  for (let dayIndex = 0; dayIndex < horizonDays; dayIndex += 1) {
    const exception = exceptionsByDayIndex.get(dayIndex);

    let isWorking: boolean;
    let startMinute: number;
    let finishMinute: number;

    if (exception) {
      isWorking = exception.isWorking;
      startMinute = exception.startMinute ?? defaultStartMinute;
      finishMinute = exception.finishMinute ?? defaultFinishMinute;
    } else {
      isWorking = workingWeekdaySet.has(dayOfWeek(absoluteStartDay + dayIndex));
      startMinute = defaultStartMinute;
      finishMinute = defaultFinishMinute;
    }

    const dayStartOffset = horizonStart + dayIndex * MINUTES_PER_DAY;
    dayStarts[dayIndex] = dayStartOffset + startMinute;
    cumulative += isWorking ? finishMinute - startMinute : 0;
    slots[dayIndex] = cumulative;
  }

  return { horizonStart, slots, dayStarts };
}

/**
 * Adds `durationMinutes` of *working* time to `start`, skipping non-working
 * time entirely (§4.2). `durationMinutes` must be >= 0 — this function only
 * moves forward; `start` need not itself be a working instant.
 */
export function addWorkingMinutes(
  start: EpochMinutes,
  durationMinutes: number,
  calendar: CompiledCalendar,
): EpochMinutes {
  if (durationMinutes < 0) {
    throw new RangeError('durationMinutes must be >= 0');
  }
  if (durationMinutes === 0) {
    return start;
  }

  const { horizonStart, slots, dayStarts } = calendar;
  const startDayIndex = Math.floor((start - horizonStart) / MINUTES_PER_DAY);
  if (startDayIndex < 0 || startDayIndex >= slots.length) {
    throw new RangeError('start falls outside the compiled calendar horizon');
  }

  const priorCumulative = startDayIndex > 0 ? (slots[startDayIndex - 1] ?? 0) : 0;
  const startDayCapacity = (slots[startDayIndex] ?? 0) - priorCumulative;
  const startDayBegin = dayStarts[startDayIndex] ?? 0;
  const startDayEnd = startDayBegin + startDayCapacity;

  let consumedOnStartDay: number;
  if (start <= startDayBegin) {
    consumedOnStartDay = 0;
  } else if (start >= startDayEnd) {
    consumedOnStartDay = startDayCapacity;
  } else {
    consumedOnStartDay = start - startDayBegin;
  }

  const target = priorCumulative + consumedOnStartDay + durationMinutes;

  const targetDayIndex = lowerBound(slots, target);
  if (targetDayIndex >= slots.length) {
    throw new RangeError('addWorkingMinutes exceeded the compiled calendar horizon');
  }

  const priorAtTargetDay = targetDayIndex > 0 ? (slots[targetDayIndex - 1] ?? 0) : 0;
  const remainderIntoDay = target - priorAtTargetDay;
  const targetDayBegin = dayStarts[targetDayIndex] ?? 0;

  return asEpochMinutes(targetDayBegin + remainderIntoDay);
}
