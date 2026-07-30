import { describe, expect, it } from 'vitest';

import type { TaskRow } from '../tasks/types.js';
import { findEpicAncestor } from './epicAncestor.js';

const projectId = '11111111-1111-4111-8111-111111111111';

function task(partial: Partial<TaskRow> & Pick<TaskRow, 'id' | 'name'>): TaskRow {
  return {
    projectId,
    parentId: null,
    wbsPath: '1',
    wbsCode: '1',
    sortOrder: 0,
    notes: null,
    isMilestone: false,
    isSummary: false,
    schedulingMode: 'agile',
    durationMinutes: null,
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
    backlogRank: 'a0',
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('findEpicAncestor', () => {
  it('returns the nearest agile summary up the parent chain', () => {
    const epic = task({
      id: 'epic-1',
      name: 'Epic',
      isSummary: true,
      schedulingMode: 'agile',
    });
    const story = task({ id: 'story-1', name: 'Story', parentId: epic.id });
    const sub = task({ id: 'sub-1', name: 'Sub', parentId: story.id });
    const byId = new Map([
      [epic.id, epic],
      [story.id, story],
      [sub.id, sub],
    ]);

    expect(findEpicAncestor(sub, byId)?.id).toBe('epic-1');
    expect(findEpicAncestor(story, byId)?.id).toBe('epic-1');
  });

  it('skips CPM summaries and returns null when no agile epic exists', () => {
    const cpmSummary = task({
      id: 'cpm-1',
      name: 'Phase',
      isSummary: true,
      schedulingMode: 'cpm',
    });
    const story = task({ id: 'story-1', name: 'Story', parentId: cpmSummary.id });
    const byId = new Map([
      [cpmSummary.id, cpmSummary],
      [story.id, story],
    ]);

    expect(findEpicAncestor(story, byId)).toBeNull();
    expect(findEpicAncestor(task({ id: 'orphan', name: 'Orphan' }), byId)).toBeNull();
  });
});
