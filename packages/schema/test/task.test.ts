import { describe, expect, it } from 'vitest';

import {
  TaskCreateInputSchema,
  TaskMoveInputSchema,
  TaskUpdateInputSchema,
} from '../src/task.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PARENT_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const CALENDAR_ID = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

const validCreate = {
  projectId: PROJECT_ID,
  name: 'Pour foundation',
};

/** Fields that must never appear on create/update input schemas (§3.3 + scope). */
const FORBIDDEN_CREATE_KEYS = [
  // CPM outputs (listed under §3.3 "CPM outputs")
  'earlyStart',
  'earlyFinish',
  'lateStart',
  'lateFinish',
  'totalFloatMinutes',
  'freeFloatMinutes',
  'isCritical',
  // Auto-generated WBS (PROJECT_SCOPE.md §5.2)
  'wbsPath',
  'wbsCode',
  // Reorder belongs on TaskMoveInputSchema
  'sortOrder',
  // Phase 4 tracking — deferred
  'percentComplete',
  'actualStart',
  'actualFinish',
  'actualDurationMinutes',
  'remainingDurationMinutes',
  // Phase 6 agile — deferred
  'storyPoints',
  'sprintId',
  'boardColumnId',
  'backlogRank',
] as const;

describe('TaskCreateInputSchema', () => {
  it('accepts a minimal valid create payload', () => {
    const result = TaskCreateInputSchema.safeParse(validCreate);
    expect(result.success).toBe(true);
  });

  it('accepts CPM planning inputs and optional parentId for initial placement', () => {
    const result = TaskCreateInputSchema.safeParse({
      ...validCreate,
      parentId: PARENT_ID,
      notes: 'Concrete pour',
      isMilestone: false,
      isSummary: false,
      schedulingMode: 'cpm',
      durationMinutes: 2880,
      taskType: 'fixed_duration',
      isEffortDriven: true,
      isManuallyScheduled: false,
      constraintType: 'asap',
      constraintDate: null,
      deadline: '2026-09-15T00:00:00Z',
      calendarId: CALENDAR_ID,
    });
    expect(result.success).toBe(true);
  });

  it('accepts parentId: null for a root task', () => {
    const result = TaskCreateInputSchema.safeParse({
      ...validCreate,
      parentId: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid constraintType', () => {
    expect(
      TaskCreateInputSchema.safeParse({
        ...validCreate,
        constraintType: 'must_start_yesterday',
      }).success,
    ).toBe(false);
  });

  it('rejects an invalid taskType', () => {
    expect(
      TaskCreateInputSchema.safeParse({
        ...validCreate,
        taskType: 'fixed_cost',
      }).success,
    ).toBe(false);
  });

  it('does not declare forbidden keys on the schema shape (omission, not validation)', () => {
    for (const key of FORBIDDEN_CREATE_KEYS) {
      expect(TaskCreateInputSchema.shape).not.toHaveProperty(key);
    }
  });

  it('strips CPM output columns from an inbound payload by omission', () => {
    const result = TaskCreateInputSchema.safeParse({
      ...validCreate,
      earlyStart: '2026-08-14T09:00:00Z',
      earlyFinish: '2026-08-19T17:00:00Z',
      lateStart: '2026-08-14T09:00:00Z',
      lateFinish: '2026-08-19T17:00:00Z',
      totalFloatMinutes: 0,
      freeFloatMinutes: 0,
      isCritical: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      for (const key of [
        'earlyStart',
        'earlyFinish',
        'lateStart',
        'lateFinish',
        'totalFloatMinutes',
        'freeFloatMinutes',
        'isCritical',
      ] as const) {
        expect(result.data).not.toHaveProperty(key);
      }
    }
  });

  it('strips wbsPath, wbsCode, and sortOrder by omission', () => {
    const result = TaskCreateInputSchema.safeParse({
      ...validCreate,
      wbsPath: '1.3.2',
      wbsCode: '1.3.2',
      sortOrder: 4,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('wbsPath');
      expect(result.data).not.toHaveProperty('wbsCode');
      expect(result.data).not.toHaveProperty('sortOrder');
    }
  });

  it('strips Phase 4 tracking and Phase 6 agile fields by omission', () => {
    const result = TaskCreateInputSchema.safeParse({
      ...validCreate,
      percentComplete: 50,
      actualStart: '2026-08-14T09:00:00Z',
      storyPoints: 5,
      sprintId: PARENT_ID,
      backlogRank: 'a0',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('percentComplete');
      expect(result.data).not.toHaveProperty('actualStart');
      expect(result.data).not.toHaveProperty('storyPoints');
      expect(result.data).not.toHaveProperty('sprintId');
      expect(result.data).not.toHaveProperty('backlogRank');
    }
  });
});

describe('TaskUpdateInputSchema', () => {
  it('requires version for optimistic locking (§9.1)', () => {
    expect(TaskUpdateInputSchema.safeParse({ name: 'Renamed' }).success).toBe(false);
  });

  it('accepts a partial patch with version', () => {
    const result = TaskUpdateInputSchema.safeParse({
      version: 7,
      durationMinutes: 480,
      constraintType: 'snet',
      constraintDate: '2026-08-20T09:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('does not declare forbidden keys on the update schema shape', () => {
    for (const key of FORBIDDEN_CREATE_KEYS) {
      expect(TaskUpdateInputSchema.shape).not.toHaveProperty(key);
    }
  });

  it('strips CPM outputs on update by omission', () => {
    const result = TaskUpdateInputSchema.safeParse({
      version: 1,
      isCritical: true,
      earlyStart: '2026-08-14T09:00:00Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('isCritical');
      expect(result.data).not.toHaveProperty('earlyStart');
    }
  });
});

describe('TaskMoveInputSchema', () => {
  it('accepts { parentId, sortOrder } matching POST /api/tasks/:id/move', () => {
    const result = TaskMoveInputSchema.safeParse({
      parentId: PARENT_ID,
      sortOrder: 2,
    });
    expect(result.success).toBe(true);
  });

  it('accepts parentId: null to move to root', () => {
    expect(
      TaskMoveInputSchema.safeParse({ parentId: null, sortOrder: 0 }).success,
    ).toBe(true);
  });

  it('rejects a missing sortOrder', () => {
    expect(TaskMoveInputSchema.safeParse({ parentId: null }).success).toBe(false);
  });
});
