import { describe, expect, it } from 'vitest';

import {
  buildChildrenIndex,
  filterTasksByCollapsed,
  taskHasChildren,
} from './taskVisibility.js';
import type { TaskRow } from './types.js';

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
    taskType: null,
    isEffortDriven: true,
    isManuallyScheduled: false,
    constraintType: null,
    constraintDate: null,
    deadline: null,
    calendarId: null,
    earlyStart: null,
    earlyFinish: null,
    lateStart: null,
    lateFinish: null,
    totalFloatMinutes: null,
    freeFloatMinutes: null,
    isCritical: false,
    storyPoints: null,
    sprintId: null,
    boardColumnId: null,
    backlogRank: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('filterTasksByCollapsed', () => {
  const parent = task({
    id: 'p',
    name: 'Parent',
    wbsPath: '1',
    wbsCode: '1',
    isSummary: true,
  });
  const child = task({
    id: 'c',
    name: 'Child',
    parentId: 'p',
    wbsPath: '1.1',
    wbsCode: '1.1',
  });
  const grand = task({
    id: 'g',
    name: 'Grand',
    parentId: 'c',
    wbsPath: '1.1.1',
    wbsCode: '1.1.1',
  });
  const other = task({
    id: 'o',
    name: 'Other',
    wbsPath: '2',
    wbsCode: '2',
  });

  it('hides descendants of a collapsed parent but keeps the parent', () => {
    const visible = filterTasksByCollapsed(
      [grand, other, child, parent],
      new Set(['p']),
    ).map((t) => t.id);
    expect(visible).toEqual(['p', 'o']);
  });

  it('hides grandchildren when an intermediate parent is collapsed', () => {
    const visible = filterTasksByCollapsed(
      [parent, child, grand, other],
      new Set(['c']),
    ).map((t) => t.id);
    expect(visible).toEqual(['p', 'c', 'o']);
  });
});

describe('buildChildrenIndex', () => {
  it('indexes direct children for collapse toggles', () => {
    const parent = task({ id: 'p', name: 'P', wbsPath: '1', wbsCode: '1' });
    const c1 = task({ id: 'c1', name: 'C1', parentId: 'p', wbsPath: '1.1', wbsCode: '1.1' });
    const c2 = task({ id: 'c2', name: 'C2', parentId: 'p', wbsPath: '1.2', wbsCode: '1.2' });
    const index = buildChildrenIndex([c2, parent, c1]);
    expect(taskHasChildren('p', index)).toBe(true);
    expect(taskHasChildren('c1', index)).toBe(false);
    expect(index.get('p')).toEqual(['c1', 'c2']);
  });
});
