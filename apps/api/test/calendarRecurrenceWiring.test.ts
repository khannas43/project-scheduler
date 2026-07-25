import {
  asEpochMinutes,
  compileCalendar,
  MINUTES_PER_DAY,
  workingMinutesBetween,
} from '@pkg/scheduler';
import { describe, expect, it } from 'vitest';

import { exceptionsFromDbRows } from '../src/services/scheduleRunner.js';

const HORIZON_DAYS = 365 * 5;
const D2024_01_01 = asEpochMinutes(19_723 * MINUTES_PER_DAY);
const D2026_12_25 = asEpochMinutes(20_812 * MINUTES_PER_DAY);
const D2026_12_18 = asEpochMinutes((20_812 - 7) * MINUTES_PER_DAY);

describe('exceptionsFromDbRows (scheduleRunner wiring)', () => {
  it('expands annual recurrence so a later-year holiday zeros working minutes', () => {
    const exceptions = exceptionsFromDbRows(
      [
        {
          exceptionDate: '2024-12-25',
          isWorking: false,
          startTime: null,
          finishTime: null,
          recurrence: { type: 'annual' },
        },
      ],
      D2024_01_01,
      HORIZON_DAYS,
    );

    // One instance per year in the 5y horizon — not just the anchor.
    expect(exceptions).toHaveLength(5);
    expect(exceptions.map((e) => e.date)).toContain(D2026_12_25);

    const calendar = compileCalendar({
      horizonStart: D2024_01_01,
      horizonDays: HORIZON_DAYS,
      workingWeekdays: [1, 2, 3, 4, 5],
      defaultStartMinute: 9 * 60,
      defaultFinishMinute: 17 * 60,
      exceptions,
    });

    // 2026-12-25 Friday — holiday from annual expansion, not the 2024 anchor.
    expect(
      workingMinutesBetween(D2026_12_25, asEpochMinutes(D2026_12_25 + MINUTES_PER_DAY), calendar),
    ).toBe(0);

    // Neighbouring Friday still works — proves we didn't blank the whole calendar.
    expect(
      workingMinutesBetween(D2026_12_18, asEpochMinutes(D2026_12_18 + MINUTES_PER_DAY), calendar),
    ).toBe(480);
  });

  it('ignores unknown recurrence shapes (treats as one-shot)', () => {
    const exceptions = exceptionsFromDbRows(
      [
        {
          exceptionDate: '2024-12-25',
          isWorking: false,
          startTime: null,
          finishTime: null,
          recurrence: { type: 'weekly' },
        },
      ],
      D2024_01_01,
      HORIZON_DAYS,
    );

    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]?.date).toBe(asEpochMinutes(20_082 * MINUTES_PER_DAY));
  });
});
