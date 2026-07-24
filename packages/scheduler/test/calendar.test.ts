import { describe, expect, it } from 'vitest';

import { addWorkingMinutes, compileCalendar, subtractWorkingMinutes, type CalendarCompilationInput } from '../src/calendar.js';
import { asEpochMinutes, MINUTES_PER_DAY } from '../src/types.js';

// Unix epoch day 0 (1970-01-01) was a Thursday. Day 4 (1970-01-05) was
// therefore a Monday — every test below is anchored there so "Monday",
// "Friday", "the weekend" etc. can be verified by hand against a real
// calendar without this package ever touching `Date`.
const MONDAY = asEpochMinutes(4 * MINUTES_PER_DAY);

const MON = 0;
const TUE = 1;
const WED = 2;
const THU = 3;
const FRI = 4;
const SAT = 5;
const SUN = 6;

function dayStart(dayOffset: number): number {
  return MONDAY + dayOffset * MINUTES_PER_DAY;
}

const NINE_AM = 9 * 60; // 540
const ELEVEN_AM = 11 * 60; // 660
const ONE_PM = 13 * 60; // 780
const FOUR_PM = 16 * 60; // 960
const FIVE_PM = 17 * 60; // 1020
const TEN_AM = 10 * 60; // 600
const TWO_PM = 14 * 60; // 840
const THREE_PM = 15 * 60; // 900

const MON_FRI_9_5: CalendarCompilationInput = {
  horizonStart: MONDAY,
  horizonDays: 21,
  workingWeekdays: [1, 2, 3, 4, 5], // Mon-Fri
  defaultStartMinute: NINE_AM,
  defaultFinishMinute: FIVE_PM,
};

describe('addWorkingMinutes (§4.2)', () => {
  it('mid-day start: adds minutes within the same working day', () => {
    const calendar = compileCalendar(MON_FRI_9_5);
    const start = asEpochMinutes(dayStart(MON) + ELEVEN_AM);

    const result = addWorkingMinutes(start, 120, calendar);

    expect(result).toBe(dayStart(MON) + ONE_PM);
  });

  it('crossing a weekend: rolls remaining duration over Sat/Sun to Monday', () => {
    const calendar = compileCalendar(MON_FRI_9_5);
    // Friday 4pm, 1 hour left in the working day.
    const start = asEpochMinutes(dayStart(FRI) + FOUR_PM);

    const result = addWorkingMinutes(start, 120, calendar);

    // 60 min consumed Friday, 60 min remaining -> next Monday 10am.
    expect(result).toBe(dayStart(MON + 7) + TEN_AM);
  });

  it('landing exactly on a day boundary: a full working day lands exactly at day end', () => {
    const calendar = compileCalendar(MON_FRI_9_5);
    const start = asEpochMinutes(dayStart(MON) + NINE_AM);

    const result = addWorkingMinutes(start, 480, calendar);

    expect(result).toBe(dayStart(MON) + FIVE_PM);
  });

  it('zero duration: returns the start time unchanged, even outside working hours', () => {
    const calendar = compileCalendar(MON_FRI_9_5);
    const start = asEpochMinutes(dayStart(SAT) + THREE_PM); // a non-working instant

    const result = addWorkingMinutes(start, 0, calendar);

    expect(result).toBe(start);
  });

  it('duration spanning a holiday exception: skips a mid-week holiday entirely', () => {
    const calendar = compileCalendar({
      ...MON_FRI_9_5,
      exceptions: [{ date: asEpochMinutes(dayStart(WED)), isWorking: false }],
    });
    // Tuesday 4pm, 1 hour left in the working day.
    const start = asEpochMinutes(dayStart(TUE) + FOUR_PM);

    const result = addWorkingMinutes(start, 120, calendar);

    // 60 min consumed Tuesday, Wednesday skipped entirely, 60 min -> Thursday 10am.
    expect(result).toBe(dayStart(THU) + TEN_AM);
  });

  it('a one-off working Saturday: an exception can turn a non-working day into a working one', () => {
    const calendar = compileCalendar({
      ...MON_FRI_9_5,
      exceptions: [
        { date: asEpochMinutes(dayStart(SAT)), isWorking: true, startMinute: TEN_AM, finishMinute: TWO_PM },
      ],
    });
    // Friday 4pm, 1 hour left; the one-off Saturday has exactly 4 hours (10am-2pm).
    const start = asEpochMinutes(dayStart(FRI) + FOUR_PM);

    const result = addWorkingMinutes(start, 300, calendar);

    // 60 Friday + 240 Saturday = 300 exactly -> lands at Saturday's day end, not Sunday.
    expect(result).toBe(dayStart(SAT) + TWO_PM);
  });

  it('a 24/7 calendar: every minute is working time, so duration is plain addition', () => {
    const calendar = compileCalendar({
      horizonStart: MONDAY,
      horizonDays: 21,
      workingWeekdays: [0, 1, 2, 3, 4, 5, 6],
      defaultStartMinute: 0,
      defaultFinishMinute: MINUTES_PER_DAY,
    });
    const start = asEpochMinutes(dayStart(WED) + 210); // arbitrary mid-night-ish instant

    const result = addWorkingMinutes(start, 4000, calendar);

    expect(result).toBe(start + 4000);
  });

  it('Sunday never contributes working minutes even when adjacent to a working Saturday', () => {
    const calendar = compileCalendar({
      ...MON_FRI_9_5,
      exceptions: [
        { date: asEpochMinutes(dayStart(SAT)), isWorking: true, startMinute: TEN_AM, finishMinute: TWO_PM },
      ],
    });
    // Saturday 10am, need all 4 hours of the one-off Saturday plus 1 more minute.
    const start = asEpochMinutes(dayStart(SAT) + TEN_AM);

    const result = addWorkingMinutes(start, 241, calendar);

    // Saturday's 240 minutes consumed exactly, Sunday contributes nothing -> Monday 9:01am.
    expect(result).toBe(dayStart(SAT + 2) + NINE_AM + 1);
  });
});

describe('subtractWorkingMinutes (§4.5 — the backward pass needs this)', () => {
  it('mid-day: subtracts within the same working day', () => {
    const calendar = compileCalendar(MON_FRI_9_5);
    const finish = asEpochMinutes(dayStart(MON) + ONE_PM);

    const result = subtractWorkingMinutes(finish, 120, calendar);

    expect(result).toBe(dayStart(MON) + ELEVEN_AM);
  });

  it('crossing a weekend backward: rolls remaining duration back over Sat/Sun to Friday', () => {
    const calendar = compileCalendar(MON_FRI_9_5);
    // Monday 10am, only 1 hour of working time available so far that day.
    const finish = asEpochMinutes(dayStart(MON + 7) + TEN_AM);

    const result = subtractWorkingMinutes(finish, 120, calendar);

    // 60 min consumed backward into Monday, 60 min remaining -> Friday 4pm.
    expect(result).toBe(dayStart(FRI) + FOUR_PM);
  });

  it('landing exactly on a day boundary: a full working day lands exactly at day start', () => {
    const calendar = compileCalendar(MON_FRI_9_5);
    const finish = asEpochMinutes(dayStart(MON) + FIVE_PM);

    const result = subtractWorkingMinutes(finish, 480, calendar);

    expect(result).toBe(dayStart(MON) + NINE_AM);
  });

  it('zero duration: returns the finish time unchanged, even outside working hours', () => {
    const calendar = compileCalendar(MON_FRI_9_5);
    const finish = asEpochMinutes(dayStart(SAT) + THREE_PM);

    const result = subtractWorkingMinutes(finish, 0, calendar);

    expect(result).toBe(finish);
  });

  it('duration spanning a holiday exception: skips a mid-week holiday entirely', () => {
    const calendar = compileCalendar({
      ...MON_FRI_9_5,
      exceptions: [{ date: asEpochMinutes(dayStart(WED)), isWorking: false }],
    });
    // Thursday 10am, only 1 hour of working time available so far that day.
    const finish = asEpochMinutes(dayStart(THU) + TEN_AM);

    const result = subtractWorkingMinutes(finish, 120, calendar);

    // 60 min consumed backward into Thursday, Wednesday skipped, 60 min -> Tuesday 4pm.
    expect(result).toBe(dayStart(TUE) + FOUR_PM);
  });

  it('is the exact inverse of addWorkingMinutes across a variety of starts and durations', () => {
    const calendar = compileCalendar({
      ...MON_FRI_9_5,
      exceptions: [
        { date: asEpochMinutes(dayStart(WED)), isWorking: false },
        { date: asEpochMinutes(dayStart(SAT + 7)), isWorking: true, startMinute: TEN_AM, finishMinute: TWO_PM },
      ],
    });

    const cases: Array<{ start: number; duration: number }> = [
      { start: dayStart(MON) + ELEVEN_AM, duration: 120 },
      { start: dayStart(FRI) + FOUR_PM, duration: 300 },
      { start: dayStart(TUE) + FOUR_PM, duration: 180 },
      { start: dayStart(MON) + NINE_AM, duration: 0 },
      { start: dayStart(SAT + 7) + TEN_AM, duration: 241 },
    ];

    for (const { start, duration } of cases) {
      const finish = addWorkingMinutes(asEpochMinutes(start), duration, calendar);
      const roundTripped = subtractWorkingMinutes(finish, duration, calendar);
      expect(roundTripped).toBe(start);
    }
  });
});

describe('compileCalendar (§4.2)', () => {
  it('builds a strictly non-decreasing prefix sum with the expected weekly total', () => {
    const calendar = compileCalendar(MON_FRI_9_5);

    for (let i = 1; i < calendar.slots.length; i += 1) {
      const previous = calendar.slots[i - 1] ?? 0;
      const current = calendar.slots[i] ?? 0;
      expect(current).toBeGreaterThanOrEqual(previous);
    }

    // Three full Mon-Fri weeks of 8-hour days = 21 * 8 * 60... but horizonDays=21
    // starting Monday covers exactly 3 full weeks: 15 working days * 480 min.
    const total = calendar.slots[calendar.slots.length - 1] ?? 0;
    expect(total).toBe(15 * 480);
  });

  it('gives non-working days zero capacity and working days exactly their configured span', () => {
    const calendar = compileCalendar(MON_FRI_9_5);

    const mondayCapacity = (calendar.slots[MON] ?? 0) - 0;
    const saturdayCapacity = (calendar.slots[SAT] ?? 0) - (calendar.slots[FRI] ?? 0);
    const sundayCapacity = (calendar.slots[SUN] ?? 0) - (calendar.slots[SAT] ?? 0);

    expect(mondayCapacity).toBe(480);
    expect(saturdayCapacity).toBe(0);
    expect(sundayCapacity).toBe(0);
  });

  it('rejects a horizonStart that is not aligned to a day boundary', () => {
    expect(() => compileCalendar({ ...MON_FRI_9_5, horizonStart: asEpochMinutes(MONDAY + 1) })).toThrow();
  });

  it('rejects a non-positive horizonDays', () => {
    expect(() => compileCalendar({ ...MON_FRI_9_5, horizonDays: 0 })).toThrow();
  });

  it('a working exception without explicit hours falls back to the calendar default hours', () => {
    const calendar = compileCalendar({
      ...MON_FRI_9_5,
      exceptions: [{ date: asEpochMinutes(dayStart(SAT)), isWorking: true }],
    });

    const saturdayCapacity = (calendar.slots[SAT] ?? 0) - (calendar.slots[FRI] ?? 0);

    expect(saturdayCapacity).toBe(480); // same as the default Mon-Fri 9-5 span
  });

  it('rejects an exception date outside the compiled horizon', () => {
    expect(() =>
      compileCalendar({
        ...MON_FRI_9_5,
        exceptions: [{ date: asEpochMinutes(dayStart(-1)), isWorking: false }],
      }),
    ).toThrow();
  });
});
