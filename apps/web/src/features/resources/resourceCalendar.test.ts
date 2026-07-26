import { describe, expect, it } from 'vitest';

import type { AssignmentRow, TaskRow } from '../tasks/types.js';
import {
  assignmentsForResource,
  contourVariesByDay,
  dayTotalUnits,
  formatUnits,
  isAssignmentOverallocated,
  isDayOverallocated,
  itemSpansUtcDay,
  itemsOnDay,
  minutesFromWorkingDays,
  monthGridCells,
  roundUnits,
  taskUtcSpan,
  unitsOnDay,
  utcDayKey,
  workingDaysFromMinutes,
} from './resourceCalendar.js';

function task(partial: Partial<TaskRow> & Pick<TaskRow, 'id' | 'name'>): TaskRow {
  return {
    projectId: 'p1',
    parentId: null,
    wbsPath: '1',
    wbsCode: '1',
    sortOrder: 0,
    notes: null,
    isMilestone: false,
    isSummary: false,
    schedulingMode: 'cpm',
    durationMinutes: 480,
    taskType: 'fixed_duration',
    isEffortDriven: true,
    isManuallyScheduled: false,
    constraintType: 'asap',
    constraintDate: null,
    deadline: null,
    calendarId: null,
    earlyStart: null,
    earlyFinish: null,
    lateStart: null,
    lateFinish: null,
    totalFloatMinutes: 0,
    freeFloatMinutes: 0,
    isCritical: false,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function assignment(
  partial: Partial<AssignmentRow> & Pick<AssignmentRow, 'id' | 'taskId' | 'resourceId'>,
): AssignmentRow {
  return {
    units: '1',
    workMinutes: 480,
    actualWorkMinutes: null,
    cost: null,
    actualCost: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('resourceCalendar helpers', () => {
  it('builds Sunday-first month grids with padding', () => {
    // Jan 2026 starts on Thursday → 4 leading nulls
    const cells = monthGridCells(2026, 0);
    expect(cells.length).toBe(42);
    expect(cells.slice(0, 4).every((c) => c === null)).toBe(true);
    expect(cells[4]).toEqual({ day: 1, dayKey: '2026-01-01' });
    expect(cells[4 + 30]).toEqual({ day: 31, dayKey: '2026-01-31' });
  });

  it('filters assignments for one resource and skips summaries', () => {
    const tasks = [
      task({
        id: 't1',
        name: 'Dig',
        earlyStart: '2026-01-05T09:00:00.000Z',
        earlyFinish: '2026-01-06T17:00:00.000Z',
      }),
      task({ id: 't2', name: 'Summary', isSummary: true }),
    ];
    const assignments = [
      assignment({ id: 'a1', taskId: 't1', resourceId: 'r1' }),
      assignment({ id: 'a2', taskId: 't2', resourceId: 'r1' }),
      assignment({ id: 'a3', taskId: 't1', resourceId: 'r2' }),
    ];
    const items = assignmentsForResource(tasks, assignments, 'r1');
    expect(items).toHaveLength(1);
    expect(items[0]!.task.id).toBe('t1');
  });

  it('detects multi-day task span on calendar days', () => {
    const item = {
      task: task({
        id: 't1',
        name: 'Pour',
        earlyStart: '2026-01-05T09:00:00.000Z',
        earlyFinish: '2026-01-07T17:00:00.000Z',
      }),
      assignment: assignment({ id: 'a1', taskId: 't1', resourceId: 'r1' }),
    };
    expect(taskUtcSpan(item.task)).toEqual({ start: '2026-01-05', finish: '2026-01-07' });
    expect(itemSpansUtcDay(item, '2026-01-05')).toBe(true);
    expect(itemSpansUtcDay(item, '2026-01-06')).toBe(true);
    expect(itemSpansUtcDay(item, '2026-01-07')).toBe(true);
    expect(itemSpansUtcDay(item, '2026-01-08')).toBe(false);
    expect(itemsOnDay([item], '2026-01-06')).toHaveLength(1);
  });

  it('converts working days ↔ minutes', () => {
    expect(workingDaysFromMinutes(960)).toBe(2);
    expect(minutesFromWorkingDays(3)).toBe(1440);
    expect(utcDayKey('2026-02-03T15:30:00.000Z')).toBe('2026-02-03');
  });

  it('flags units above max as overallocated', () => {
    const item = {
      task: task({
        id: 't1',
        name: 'Pour',
        earlyStart: '2026-01-05T09:00:00.000Z',
        earlyFinish: '2026-01-05T17:00:00.000Z',
      }),
      assignment: assignment({ id: 'a1', taskId: 't1', resourceId: 'r1', units: '1.5' }),
    };
    expect(isAssignmentOverallocated(item, 1)).toBe(true);
    expect(isAssignmentOverallocated({ ...item, assignment: { ...item.assignment, units: '1' } }, 1)).toBe(
      false,
    );
  });

  it('snaps messy units to 0.05 steps', () => {
    expect(roundUnits(0.91)).toBe(0.9);
    expect(roundUnits(0.96)).toBe(0.95);
    expect(formatUnits('0.910416')).toBe('0.9');
  });

  it('sums day load and detects day overallocation', () => {
    const items = [
      {
        task: task({
          id: 't1',
          name: 'A',
          earlyStart: '2026-01-05T09:00:00.000Z',
          earlyFinish: '2026-01-05T17:00:00.000Z',
        }),
        assignment: assignment({ id: 'a1', taskId: 't1', resourceId: 'r1', units: '0.6' }),
      },
      {
        task: task({
          id: 't2',
          name: 'B',
          earlyStart: '2026-01-05T09:00:00.000Z',
          earlyFinish: '2026-01-05T17:00:00.000Z',
        }),
        assignment: assignment({ id: 'a2', taskId: 't2', resourceId: 'r1', units: '0.6' }),
      },
    ];
    expect(dayTotalUnits(items, '2026-01-05')).toBeCloseTo(1.2);
    expect(isDayOverallocated(items, '2026-01-05', 1)).toBe(true);
    expect(isDayOverallocated(items, '2026-01-06', 1)).toBe(false);
  });

  it('reads per-day units from the timephased contour, not flat assignment units', () => {
    const item = {
      task: task({
        id: 't1',
        name: 'Pour',
        earlyStart: '2026-01-05T09:00:00.000Z',
        earlyFinish: '2026-01-06T17:00:00.000Z',
      }),
      assignment: assignment({ id: 'a1', taskId: 't1', resourceId: 'r1', units: '1' }),
    };
    const contour = [
      { periodDate: '2026-01-05', plannedWorkMinutes: 240 },
      { periodDate: '2026-01-06', plannedWorkMinutes: 480 },
    ];
    expect(unitsOnDay(item, '2026-01-05', contour)).toBe(0.5);
    expect(unitsOnDay(item, '2026-01-06', contour)).toBe(1);
    expect(contourVariesByDay(contour)).toBe(true);
    const map = new Map([['a1', contour]]);
    expect(dayTotalUnits([item], '2026-01-05', map)).toBe(0.5);
    expect(isDayOverallocated([item], '2026-01-05', 1, map)).toBe(false);
  });
});
