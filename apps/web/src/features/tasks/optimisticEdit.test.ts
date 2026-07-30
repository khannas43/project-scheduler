import { describe, expect, it } from 'vitest';

import type { Project } from '../projects/index.js';
import {
  applyOptimisticEdit,
  applyPatchToTree,
  mergeAffectedIntoTree,
  sortTasksForGrid,
} from './optimisticEdit.js';
import type { TaskRow, TaskTreeResponse } from './types.js';

const calendarId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const taskA = '33333333-3333-4333-8333-333333333333';
const taskB = '44444444-4444-4444-8444-444444444444';

function baseProject(): Project {
  return {
    id: projectId,
    name: 'Demo',
    description: null,
    status: 'active',
    startDate: '2026-01-05T00:00:00.000Z', // Monday
    finishDate: null,
    statusDate: null,
    calendarId,
    ownerId: '55555555-5555-4555-8555-555555555555',
    isArchived: false,
    settings: {
      dateFormat: 'yyyy-mm-dd',
      dateTimeDisplay: 'date',
      activeBaselineId: null,
      showBaselineOnGantt: false,
      storyPointScale: 'fibonacci',
    },
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

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
    schedulingMode: 'cpm',
    durationMinutes: 480,
    taskType: 'fixed_duration',
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
    version: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function baseTree(): TaskTreeResponse {
  return {
    projectVersion: 3,
    calendars: [
      {
        id: calendarId,
        name: 'Standard',
        projectId,
        workingDays: [1, 2, 3, 4, 5],
        hoursPerDay: '8',
        defaultStart: '09:00:00',
        defaultFinish: '17:00:00',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    dependencies: [
      {
        id: '66666666-6666-4666-8666-666666666666',
        predecessorId: taskA,
        successorId: taskB,
        linkType: 'FS',
        lagMinutes: 0,
        lagPercent: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    assignments: [],
    tasks: [
      task({ id: taskA, name: 'Foundation', wbsPath: '1', wbsCode: '1', sortOrder: 0, durationMinutes: 480 }),
      task({
        id: taskB,
        name: 'Framing',
        wbsPath: '2',
        wbsCode: '2',
        sortOrder: 1,
        durationMinutes: 480,
        earlyStart: '2026-01-05T09:00:00.000Z',
      }),
    ],
  };
}

describe('optimistic edit reducer', () => {
  it('onMutate: applies the patch and merges local schedule CPM fields', () => {
    const snapshot = baseTree();
    const next = applyOptimisticEdit(snapshot, baseProject(), {
      taskId: taskA,
      version: 0,
      durationMinutes: 960,
    });

    const a = next.tasks.find((t) => t.id === taskA)!;
    const b = next.tasks.find((t) => t.id === taskB)!;

    expect(a.durationMinutes).toBe(960);
    expect(a.earlyStart).toBeTruthy();
    expect(a.earlyFinish).toBeTruthy();
    expect(b.earlyStart).toBeTruthy();
    // Successor cannot start before predecessor finishes — local recompute moved B.
    expect(new Date(b.earlyStart!).getTime()).toBeGreaterThanOrEqual(
      new Date(a.earlyFinish!).getTime(),
    );
    // Snapshot untouched.
    expect(snapshot.tasks.find((t) => t.id === taskA)!.durationMinutes).toBe(480);
  });

  it('onError path: snapshot restore is a faithful copy of pre-mutate state', () => {
    const snapshot = baseTree();
    const optimistic = applyOptimisticEdit(snapshot, baseProject(), {
      taskId: taskA,
      version: 0,
      name: 'Renamed',
      durationMinutes: 120,
    });

    expect(optimistic.tasks.find((t) => t.id === taskA)!.name).toBe('Renamed');

    // Simulate onError restoring ctx.snapshot
    const restored = snapshot;
    expect(restored.tasks.find((t) => t.id === taskA)!.name).toBe('Foundation');
    expect(restored.tasks.find((t) => t.id === taskA)!.durationMinutes).toBe(480);
    expect(restored).not.toBe(optimistic);
  });

  it('applyPatchToTree only mutates the target task', () => {
    const snapshot = baseTree();
    const patched = applyPatchToTree(snapshot, {
      taskId: taskB,
      version: 0,
      name: 'Structure',
    });
    expect(patched.tasks.find((t) => t.id === taskA)!.name).toBe('Foundation');
    expect(patched.tasks.find((t) => t.id === taskB)!.name).toBe('Structure');
  });

  it('onSuccess: merges affected + focus by id and bumps projectVersion', () => {
    const tree = applyOptimisticEdit(baseTree(), baseProject(), {
      taskId: taskA,
      version: 0,
      durationMinutes: 960,
    });

    const merged = mergeAffectedIntoTree(tree, {
      projectVersion: 99,
      task: {
        ...tree.tasks.find((t) => t.id === taskA)!,
        version: 1,
        name: 'Foundation (server)',
      },
      affected: [
        {
          ...tree.tasks.find((t) => t.id === taskB)!,
          isCritical: true,
          totalFloatMinutes: 0,
        },
      ],
    });

    expect(merged.projectVersion).toBe(99);
    expect(merged.tasks.find((t) => t.id === taskA)!.name).toBe('Foundation (server)');
    expect(merged.tasks.find((t) => t.id === taskA)!.version).toBe(1);
    expect(merged.tasks.find((t) => t.id === taskB)!.isCritical).toBe(true);
  });
});

describe('sortTasksForGrid', () => {
  it('places a child immediately after its parent even when sortOrder collides with another root', () => {
    // Live bug: sortOrder resets per sibling group, so child of root-2 can share
    // sortOrder 0 with root-1 and float before its own parent under a sortOrder sort.
    const root1 = task({
      id: 'r1',
      name: 'Root A',
      parentId: null,
      wbsPath: '1',
      wbsCode: '1',
      sortOrder: 0,
    });
    const root2 = task({
      id: 'r2',
      name: 'Root B',
      parentId: null,
      wbsPath: '2',
      wbsCode: '2',
      sortOrder: 1,
    });
    const childOfRoot2 = task({
      id: 'c2',
      name: 'Child of B',
      parentId: 'r2',
      wbsPath: '2.1',
      wbsCode: '2.1',
      sortOrder: 0, // collides with root1.sortOrder
    });

    // Deliberately reverse / interleaved input order.
    const ordered = sortTasksForGrid([childOfRoot2, root1, root2]).map((t) => t.id);
    expect(ordered).toEqual(['r1', 'r2', 'c2']);
  });

  it('orders 10th+ siblings numerically (1.10 after 1.9, not before)', () => {
    const rows = [
      task({ id: 'p', name: 'Parent', wbsPath: '1', wbsCode: '1', sortOrder: 0 }),
      task({
        id: 's10',
        name: 'Sibling 10',
        parentId: 'p',
        wbsPath: '1.10',
        wbsCode: '1.10',
        sortOrder: 9,
      }),
      task({
        id: 's9',
        name: 'Sibling 9',
        parentId: 'p',
        wbsPath: '1.9',
        wbsCode: '1.9',
        sortOrder: 8,
      }),
      task({
        id: 's2',
        name: 'Sibling 2',
        parentId: 'p',
        wbsPath: '1.2',
        wbsCode: '1.2',
        sortOrder: 1,
      }),
    ];

    expect(sortTasksForGrid(rows).map((t) => t.wbsPath)).toEqual(['1', '1.2', '1.9', '1.10']);
  });
});
