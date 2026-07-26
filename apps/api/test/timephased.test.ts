import { asCalendarId, asEpochMinutes, compileCalendar, MINUTES_PER_DAY } from '@pkg/scheduler';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const MONDAY = asEpochMinutes(4 * MINUTES_PER_DAY); // 1970-01-05
const NINE_AM = 9 * 60;
const FIVE_PM = 17 * 60;

function utcDay(offsetFromMonday: number): Date {
  return new Date((MONDAY + offsetFromMonday * MINUTES_PER_DAY) * 60_000);
}

function periodDate(offsetFromMonday: number): string {
  return utcDay(offsetFromMonday).toISOString().slice(0, 10);
}

const monFri = compileCalendar({
  horizonStart: MONDAY,
  horizonDays: 21,
  workingWeekdays: [1, 2, 3, 4, 5],
  defaultStartMinute: NINE_AM,
  defaultFinishMinute: FIVE_PM,
});

const loadCompiledCalendars = vi.fn();

vi.mock('../src/db/client.js', () => ({ db: {} }));

vi.mock('../src/services/scheduleRunner.js', () => ({
  loadCompiledCalendars: (...args: unknown[]) => loadCompiledCalendars(...args),
  withSerializableRetry: vi.fn(),
  writeAuditLog: vi.fn(),
}));

const {
  dayUnitsFromMinutes,
  distributeWorkAcrossWorkingDays,
  minutesFromDayUnits,
  normalizePeriodDate,
  peakUnitsFromBuckets,
  refreshTimephasedDistribution,
  roundUnits,
} = await import('../src/services/assignmentService.js');

describe('roundUnits', () => {
  it('snaps messy fractions to 0.05 steps', () => {
    expect(roundUnits(0.91)).toBe(0.9);
    expect(roundUnits(0.96)).toBe(0.95);
    expect(roundUnits(0.910416)).toBe(0.9);
    expect(roundUnits(1.0)).toBe(1);
    expect(roundUnits(0.5)).toBe(0.5);
  });

  it('converts day units ↔ minutes cleanly', () => {
    expect(minutesFromDayUnits(0.5)).toBe(240);
    expect(dayUnitsFromMinutes(240)).toBe(0.5);
    expect(dayUnitsFromMinutes(437)).toBe(0.9);
  });

  it('uses peak day units across a contour (not the average)', () => {
    expect(
      peakUnitsFromBuckets([
        { plannedWorkMinutes: 240 }, // 0.5
        { plannedWorkMinutes: 480 }, // 1.0
      ]),
    ).toBe(1);
    expect(normalizePeriodDate('2026-01-05T00:00:00.000Z')).toBe('2026-01-05');
  });
});

describe('distributeWorkAcrossWorkingDays', () => {
  it('splits work evenly across Mon–Fri working days', () => {
    const buckets = distributeWorkAcrossWorkingDays(
      100,
      utcDay(0), // Mon
      utcDay(4), // Fri
      monFri,
    );
    expect(buckets.map((b) => b.periodDate)).toEqual([
      periodDate(0),
      periodDate(1),
      periodDate(2),
      periodDate(3),
      periodDate(4),
    ]);
    expect(buckets.every((b) => b.plannedWorkMinutes === 20)).toBe(true);
    expect(buckets.reduce((s, b) => s + b.plannedWorkMinutes, 0)).toBe(100);
  });

  it('puts the remainder on the last working day', () => {
    const buckets = distributeWorkAcrossWorkingDays(103, utcDay(0), utcDay(4), monFri);
    expect(buckets.map((b) => b.plannedWorkMinutes)).toEqual([20, 20, 20, 20, 23]);
    expect(buckets.reduce((s, b) => s + b.plannedWorkMinutes, 0)).toBe(103);
  });

  it('skips a holiday exception mid-range (calendar-aware, not naive Mon–Fri)', () => {
    const wed = asEpochMinutes(MONDAY + 2 * MINUTES_PER_DAY);
    const withHoliday = compileCalendar({
      horizonStart: MONDAY,
      horizonDays: 21,
      workingWeekdays: [1, 2, 3, 4, 5],
      defaultStartMinute: NINE_AM,
      defaultFinishMinute: FIVE_PM,
      exceptions: [{ date: wed, isWorking: false }],
    });

    const buckets = distributeWorkAcrossWorkingDays(80, utcDay(0), utcDay(4), withHoliday);
    expect(buckets.map((b) => b.periodDate)).toEqual([
      periodDate(0),
      periodDate(1),
      // Wed holiday omitted
      periodDate(3),
      periodDate(4),
    ]);
    expect(buckets.map((b) => b.plannedWorkMinutes)).toEqual([20, 20, 20, 20]);
    expect(buckets.reduce((s, b) => s + b.plannedWorkMinutes, 0)).toBe(80);
  });

  it('returns [] for a zero-duration milestone (workMinutes = 0)', () => {
    expect(distributeWorkAcrossWorkingDays(0, utcDay(0), utcDay(0), monFri)).toEqual([]);
  });

  it('returns [] when the range has no working days', () => {
    // Sat–Sun only
    expect(distributeWorkAcrossWorkingDays(480, utcDay(5), utcDay(6), monFri)).toEqual([]);
  });

  it('skips the weekend when the span includes Sat/Sun', () => {
    const buckets = distributeWorkAcrossWorkingDays(40, utcDay(4), utcDay(7), monFri);
    // Fri + Mon (skip Sat/Sun)
    expect(buckets.map((b) => b.periodDate)).toEqual([periodDate(4), periodDate(7)]);
    expect(buckets.map((b) => b.plannedWorkMinutes)).toEqual([20, 20]);
  });
});

describe('refreshTimephasedDistribution', () => {
  const deleteWhere = vi.fn();
  const insertValues = vi.fn();
  const selectResults: unknown[][] = [];

  const tx = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => selectResults.shift() ?? []),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: deleteWhere,
    })),
    insert: vi.fn(() => ({
      values: insertValues,
    })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    selectResults.length = 0;
    deleteWhere.mockResolvedValue(undefined);
    insertValues.mockResolvedValue(undefined);
    loadCompiledCalendars.mockResolvedValue({
      calendars: new Map([[asCalendarId('cal-1'), monFri]]),
      defaultCalendarId: asCalendarId('cal-1'),
    });
  });

  it('deletes prior rows before inserting a recomputed distribution', async () => {
    const assignment = {
      id: 'asg-1',
      taskId: 'task-1',
      resourceId: 'res-1',
      workMinutes: 40,
    };
    const resource = { id: 'res-1', resourceType: 'work' };
    const task = {
      id: 'task-1',
      projectId: 'proj-1',
      calendarId: 'cal-1',
      earlyStart: utcDay(0),
      earlyFinish: utcDay(1),
    };
    const project = {
      id: 'proj-1',
      calendarId: 'cal-1',
      startDate: utcDay(0),
    };

    // First refresh
    selectResults.push([assignment], [resource], [task], [project]);
    await refreshTimephasedDistribution(tx as never, 'asg-1');

    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledTimes(1);
    const firstInsert = insertValues.mock.calls[0]![0] as Array<{
      periodDate: string;
      plannedWorkMinutes: number;
    }>;
    expect(firstInsert).toHaveLength(2);
    expect(firstInsert.reduce((s, r) => s + r.plannedWorkMinutes, 0)).toBe(40);

    // Second refresh with different workMinutes — prior rows deleted again, no leftover.
    const assignment2 = { ...assignment, workMinutes: 10 };
    selectResults.push([assignment2], [resource], [task], [project]);
    await refreshTimephasedDistribution(tx as never, 'asg-1');

    expect(deleteWhere).toHaveBeenCalledTimes(2);
    expect(insertValues).toHaveBeenCalledTimes(2);
    const secondInsert = insertValues.mock.calls[1]![0] as Array<{
      plannedWorkMinutes: number;
    }>;
    expect(secondInsert.reduce((s, r) => s + r.plannedWorkMinutes, 0)).toBe(10);
  });

  it('skips non-work resources without deleting or inserting', async () => {
    selectResults.push(
      [{ id: 'asg-1', resourceId: 'res-1', taskId: 'task-1', workMinutes: 480 }],
      [{ id: 'res-1', resourceType: 'material' }],
    );

    await refreshTimephasedDistribution(tx as never, 'asg-1');

    expect(deleteWhere).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
    expect(loadCompiledCalendars).not.toHaveBeenCalled();
  });

  it('skips unscheduled tasks (null earlyStart/earlyFinish)', async () => {
    selectResults.push(
      [{ id: 'asg-1', resourceId: 'res-1', taskId: 'task-1', workMinutes: 480 }],
      [{ id: 'res-1', resourceType: 'work' }],
      [{ id: 'task-1', projectId: 'proj-1', earlyStart: null, earlyFinish: null }],
    );

    await refreshTimephasedDistribution(tx as never, 'asg-1');

    expect(deleteWhere).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
    expect(loadCompiledCalendars).not.toHaveBeenCalled();
  });
});
