import { describe, expect, it } from 'vitest';

import {
  expandRecurringExceptions,
  type RawCalendarException,
} from '../src/calendarRecurrence.js';
import { compileCalendar, workingMinutesBetween } from '../src/calendar.js';
import { asEpochMinutes, MINUTES_PER_DAY } from '../src/types.js';

/** Known UTC midnights — verified against Unix epoch arithmetic, no Date in src. */
const D2024_01_01 = asEpochMinutes(19_723 * MINUTES_PER_DAY);
const D2024_12_25 = asEpochMinutes(20_082 * MINUTES_PER_DAY);
const D2025_12_25 = asEpochMinutes(20_447 * MINUTES_PER_DAY);
const D2026_12_25 = asEpochMinutes(20_812 * MINUTES_PER_DAY);
const D2027_12_25 = asEpochMinutes(21_177 * MINUTES_PER_DAY);
const D2028_12_25 = asEpochMinutes(21_543 * MINUTES_PER_DAY);
const D2020_02_29 = asEpochMinutes(18_321 * MINUTES_PER_DAY);
const D2024_02_29 = asEpochMinutes(19_782 * MINUTES_PER_DAY);
const D2020_01_01 = asEpochMinutes(18_262 * MINUTES_PER_DAY); // 2020-01-01

const HORIZON_5Y = 365 * 5;

describe('expandRecurringExceptions', () => {
  it('expands an annual Dec-25 holiday across every year overlapping a 5-year horizon', () => {
    const raw: RawCalendarException[] = [
      {
        date: D2024_12_25,
        isWorking: false,
        recurrence: { type: 'annual' },
      },
    ];

    const expanded = expandRecurringExceptions(raw, D2024_01_01, HORIZON_5Y);
    const dates = expanded.map((e) => e.date);

    expect(dates).toEqual([
      D2024_12_25,
      D2025_12_25,
      D2026_12_25,
      D2027_12_25,
      D2028_12_25,
    ]);
    expect(expanded.every((e) => e.isWorking === false)).toBe(true);
  });

  it('skips Feb 29 in non-leap years (does not shift to Feb 28 or Mar 1)', () => {
    // Horizon spans 2020-01-01 .. ~2024-12-30 — leap days only in 2020 and 2024.
    const raw: RawCalendarException[] = [
      {
        date: D2020_02_29,
        isWorking: false,
        recurrence: { type: 'annual' },
      },
    ];

    const expanded = expandRecurringExceptions(raw, D2020_01_01, HORIZON_5Y);
    const dates = expanded.map((e) => e.date);

    expect(dates).toEqual([D2020_02_29, D2024_02_29]);
    // Pin the deliberate skip rule: no synthetic 2021/2022/2023 instances.
    expect(dates).toHaveLength(2);
  });

  it('filters a non-recurring exception outside the horizon (does not throw)', () => {
    const outside: RawCalendarException = {
      date: D2028_12_25, // outside a short 30-day horizon from 2024-01-01
      isWorking: false,
      recurrence: null,
    };

    expect(() => expandRecurringExceptions([outside], D2024_01_01, 30)).not.toThrow();
    expect(expandRecurringExceptions([outside], D2024_01_01, 30)).toEqual([]);
  });

  it('passes through a non-recurring in-range exception unchanged', () => {
    const raw: RawCalendarException[] = [
      {
        date: D2024_12_25,
        isWorking: true,
        startMinute: 10 * 60,
        finishMinute: 14 * 60,
      },
    ];

    expect(expandRecurringExceptions(raw, D2024_01_01, HORIZON_5Y)).toEqual([
      {
        date: D2024_12_25,
        isWorking: true,
        startMinute: 10 * 60,
        finishMinute: 14 * 60,
      },
    ]);
  });

  it('preserves start/finish minutes on every annual instance', () => {
    const expanded = expandRecurringExceptions(
      [
        {
          date: D2024_12_25,
          isWorking: true,
          startMinute: 600,
          finishMinute: 840,
          recurrence: { type: 'annual' },
        },
      ],
      D2024_01_01,
      HORIZON_5Y,
    );

    expect(expanded).toHaveLength(5);
    for (const ex of expanded) {
      expect(ex.startMinute).toBe(600);
      expect(ex.finishMinute).toBe(840);
      expect(ex.isWorking).toBe(true);
    }
  });
});

describe('annual recurrence → compileCalendar (integration)', () => {
  it('makes Dec 25 in a later year non-working, not just the anchor year', () => {
    const expanded = expandRecurringExceptions(
      [
        {
          date: D2024_12_25,
          isWorking: false,
          recurrence: { type: 'annual' },
        },
      ],
      D2024_01_01,
      HORIZON_5Y,
    );

    const calendar = compileCalendar({
      horizonStart: D2024_01_01,
      horizonDays: HORIZON_5Y,
      workingWeekdays: [1, 2, 3, 4, 5],
      defaultStartMinute: 9 * 60,
      defaultFinishMinute: 17 * 60,
      exceptions: expanded,
    });

    // 2026-12-25 is a Friday — without the holiday it would be a full 480-min day.
    const dayStart = D2026_12_25;
    const dayEnd = asEpochMinutes(D2026_12_25 + MINUTES_PER_DAY);
    expect(workingMinutesBetween(dayStart, dayEnd, calendar)).toBe(0);

    // A normal Friday in 2026 with no holiday still has capacity (2026-12-18).
    const plainFriday = asEpochMinutes((20_812 - 7) * MINUTES_PER_DAY); // 2026-12-18
    expect(
      workingMinutesBetween(plainFriday, asEpochMinutes(plainFriday + MINUTES_PER_DAY), calendar),
    ).toBe(480);
  });
});
