import { describe, expect, it } from 'vitest';

import {
  applyScheduleFilters,
  DEFAULT_SCHEDULE_FILTERS,
  filterDependenciesForTasks,
  lookaheadWindow,
  NEAR_CRITICAL_FLOAT_MINUTES,
  type ScheduleFilterState,
} from './scheduleFilters.js';
import type { AssignmentRow, DependencyRow, TaskRow } from './types.js';

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
    isEffortDriven: false,
    isManuallyScheduled: false,
    constraintType: 'asap',
    constraintDate: null,
    deadline: null,
    calendarId: null,
    earlyStart: '2026-08-17T09:00:00.000Z',
    earlyFinish: '2026-08-18T17:00:00.000Z',
    lateStart: null,
    lateFinish: null,
    totalFloatMinutes: 0,
    freeFloatMinutes: 0,
    isCritical: false,
    storyPoints: null,
    sprintId: null,
    boardColumnId: null,
    backlogRank: null,
    version: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...partial,
  };
}

function assignment(taskId: string, resourceId: string): AssignmentRow {
  return {
    id: `a-${taskId}-${resourceId}`,
    taskId,
    resourceId,
    units: '1',
    workMinutes: 480,
    actualWorkMinutes: null,
    cost: null,
    actualCost: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

const summary = task({
  id: 's1',
  name: 'Phase',
  isSummary: true,
  earlyStart: '2026-08-17T09:00:00.000Z',
  earlyFinish: '2026-09-10T17:00:00.000Z',
  totalFloatMinutes: null,
});

const criticalLeaf = task({
  id: 'c1',
  name: 'Critical',
  parentId: 's1',
  isCritical: true,
  totalFloatMinutes: 0,
  earlyStart: '2026-08-17T09:00:00.000Z',
  earlyFinish: '2026-08-20T17:00:00.000Z',
});

const nearLeaf = task({
  id: 'n1',
  name: 'Near',
  parentId: 's1',
  isCritical: false,
  totalFloatMinutes: NEAR_CRITICAL_FLOAT_MINUTES,
  earlyStart: '2026-08-24T09:00:00.000Z',
  earlyFinish: '2026-08-28T17:00:00.000Z',
});

const farLeaf = task({
  id: 'f1',
  name: 'Far',
  parentId: 's1',
  isCritical: false,
  totalFloatMinutes: 5000,
  earlyStart: '2026-10-01T09:00:00.000Z',
  earlyFinish: '2026-10-08T17:00:00.000Z',
});

const allTasks = [summary, criticalLeaf, nearLeaf, farLeaf];

describe('lookaheadWindow', () => {
  it('starts at status date UTC midnight and spans N weeks', () => {
    const { start, end } = lookaheadWindow('2026-08-17T15:30:00.000Z', 2);
    expect(start.toISOString()).toBe('2026-08-17T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });
});

describe('applyScheduleFilters', () => {
  it('returns all tasks when filters are inactive', () => {
    expect(
      applyScheduleFilters(allTasks, [], DEFAULT_SCHEDULE_FILTERS, { statusDate: null }).map(
        (t) => t.id,
      ),
    ).toEqual(['s1', 'c1', 'n1', 'f1']);
  });

  it('keeps critical leaves and their ancestors', () => {
    const state: ScheduleFilterState = { ...DEFAULT_SCHEDULE_FILTERS, focus: 'critical' };
    expect(
      applyScheduleFilters(allTasks, [], state, { statusDate: null }).map((t) => t.id),
    ).toEqual(['s1', 'c1']);
  });

  it('includes near-critical float band', () => {
    const state: ScheduleFilterState = { ...DEFAULT_SCHEDULE_FILTERS, focus: 'near_critical' };
    expect(
      applyScheduleFilters(allTasks, [], state, { statusDate: null }).map((t) => t.id),
    ).toEqual(['s1', 'c1', 'n1']);
  });

  it('lookahead keeps tasks overlapping the window', () => {
    const state: ScheduleFilterState = {
      ...DEFAULT_SCHEDULE_FILTERS,
      focus: 'lookahead',
      lookaheadWeeks: 2,
    };
    expect(
      applyScheduleFilters(allTasks, [], state, {
        statusDate: '2026-08-17T00:00:00.000Z',
      }).map((t) => t.id),
    ).toEqual(['s1', 'c1', 'n1']);
  });

  it('filters by resource assignment', () => {
    const state: ScheduleFilterState = {
      ...DEFAULT_SCHEDULE_FILTERS,
      resourceId: 'r1',
    };
    const assignments = [assignment('f1', 'r1'), assignment('c1', 'r2')];
    expect(
      applyScheduleFilters(allTasks, assignments, state, { statusDate: null }).map((t) => t.id),
    ).toEqual(['s1', 'f1']);
  });
});

describe('filterDependenciesForTasks', () => {
  it('drops links whose endpoints are filtered out', () => {
    const deps: DependencyRow[] = [
      {
        id: 'd1',
        predecessorId: 'c1',
        successorId: 'n1',
        linkType: 'FS',
        lagMinutes: 0,
        lagPercent: null,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
      {
        id: 'd2',
        predecessorId: 'n1',
        successorId: 'f1',
        linkType: 'FS',
        lagMinutes: 0,
        lagPercent: null,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ];
    const visible = [criticalLeaf, nearLeaf];
    expect(filterDependenciesForTasks(deps, visible).map((d) => d.id)).toEqual(['d1']);
  });
});
