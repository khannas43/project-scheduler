import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BadRequestError, ConflictError } from '../src/middleware/errors.js';

const writeAuditLog = vi.fn();
const rescheduleProject = vi.fn();
const withSerializableRetry = vi.fn(
  async (fn: (tx: unknown) => Promise<unknown>, _db?: unknown) => {
    void _db;
    return fn(tx);
  },
);
const hasDependencies = vi.fn();
const maxBacklogRank = vi.fn();
const nextBacklogRank = vi.fn();

const existingTask = {
  id: 'task-1',
  projectId: 'proj-1',
  parentId: null,
  name: 'Story',
  isSummary: false,
  isMilestone: false,
  schedulingMode: 'cpm',
  durationMinutes: 480,
  taskType: 'fixed_duration',
  constraintType: 'asap',
  constraintDate: new Date('2026-01-01T00:00:00.000Z'),
  deadline: new Date('2026-02-01T00:00:00.000Z'),
  criticalOverride: true,
  earlyStart: new Date('2026-01-01T00:00:00.000Z'),
  earlyFinish: new Date('2026-01-02T00:00:00.000Z'),
  lateStart: new Date('2026-01-01T00:00:00.000Z'),
  lateFinish: new Date('2026-01-02T00:00:00.000Z'),
  totalFloatMinutes: 0,
  freeFloatMinutes: 0,
  isCritical: true,
  storyPoints: null,
  sprintId: null,
  boardColumnId: null,
  backlogRank: null,
  version: 3,
};

let selectLimit: ReturnType<typeof vi.fn>;
let updateReturning: ReturnType<typeof vi.fn>;
let updateSet: ReturnType<typeof vi.fn>;
let tx: {
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

vi.mock('../src/db/client.js', () => ({ db: {} }));

vi.mock('../src/services/scheduleRunner.js', () => ({
  withSerializableRetry: (fn: (tx: unknown) => Promise<unknown>, dbArg: unknown) =>
    withSerializableRetry(fn, dbArg),
  writeAuditLog: (...args: unknown[]) => writeAuditLog(...args),
  rescheduleProject: (...args: unknown[]) => rescheduleProject(...args),
}));

vi.mock('../src/services/dependencyService.js', () => ({
  hasDependencies: (...args: unknown[]) => hasDependencies(...args),
}));

vi.mock('../src/services/backlogRank.js', () => ({
  maxBacklogRank: (...args: unknown[]) => maxBacklogRank(...args),
  nextBacklogRank: (...args: unknown[]) => nextBacklogRank(...args),
  reorderTaskInBacklog: vi.fn(),
}));

const { updateTask } = await import('../src/services/taskService.js');

describe('updateTask planning-mode switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectLimit = vi.fn();
    updateReturning = vi.fn();
    updateSet = vi.fn(() => ({
      where: vi.fn(() => ({
        returning: updateReturning,
      })),
    }));
    tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: selectLimit,
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: updateSet,
      })),
    };
    withSerializableRetry.mockImplementation(
      async (fn: (txArg: unknown) => Promise<unknown>, _db?: unknown) => {
        void _db;
        return fn(tx);
      },
    );
    rescheduleProject.mockResolvedValue({ task: { ...existingTask, schedulingMode: 'agile' } });
    maxBacklogRank.mockResolvedValue('a0');
    nextBacklogRank.mockReturnValue('a1');
  });

  it('rejects switching to agile when the task has dependencies', async () => {
    selectLimit.mockResolvedValueOnce([existingTask]);
    hasDependencies.mockResolvedValueOnce(true);

    await expect(
      updateTask('task-1', { version: 3, schedulingMode: 'agile' }, 'user-1'),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof BadRequestError && /dependencies/.test((err as Error).message),
    );
    expect(updateSet).not.toHaveBeenCalled();
  });

  it('rejects switching a summary to agile', async () => {
    selectLimit.mockResolvedValueOnce([{ ...existingTask, isSummary: true }]);
    hasDependencies.mockResolvedValueOnce(false);

    await expect(
      updateTask('task-1', { version: 3, schedulingMode: 'agile' }, 'user-1'),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof BadRequestError && /Summary tasks cannot switch to agile/.test((err as Error).message),
    );
  });

  it('clears CPM fields and assigns a backlogRank when switching to agile', async () => {
    selectLimit.mockResolvedValueOnce([existingTask]);
    hasDependencies.mockResolvedValueOnce(false);
    const updated = { ...existingTask, schedulingMode: 'agile', backlogRank: 'a1', version: 4 };
    updateReturning.mockResolvedValueOnce([updated]);
    rescheduleProject.mockResolvedValueOnce({ task: updated });

    await updateTask('task-1', { version: 3, schedulingMode: 'agile' }, 'user-1');

    const setArg = updateSet.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg.schedulingMode).toBe('agile');
    expect(setArg.durationMinutes).toBeNull();
    expect(setArg.constraintType).toBeNull();
    expect(setArg.constraintDate).toBeNull();
    expect(setArg.deadline).toBeNull();
    expect(setArg.criticalOverride).toBeNull();
    expect(setArg.earlyStart).toBeNull();
    expect(setArg.earlyFinish).toBeNull();
    expect(setArg.lateStart).toBeNull();
    expect(setArg.lateFinish).toBeNull();
    expect(setArg.totalFloatMinutes).toBeNull();
    expect(setArg.freeFloatMinutes).toBeNull();
    expect(setArg.isCritical).toBe(false);
    expect(setArg.backlogRank).toBe('a1');
    expect(rescheduleProject).toHaveBeenCalled();
  });

  it('clears agile fields when switching to cpm', async () => {
    const agileTask = {
      ...existingTask,
      schedulingMode: 'agile',
      storyPoints: '5',
      sprintId: 'sprint-1',
      boardColumnId: 'col-1',
      backlogRank: 'a0',
      durationMinutes: null,
    };
    selectLimit.mockResolvedValueOnce([agileTask]);
    const updated = { ...agileTask, schedulingMode: 'cpm', version: 4 };
    updateReturning.mockResolvedValueOnce([updated]);
    rescheduleProject.mockResolvedValueOnce({ task: updated });

    await updateTask('task-1', { version: 3, schedulingMode: 'cpm' }, 'user-1');

    const setArg = updateSet.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg.schedulingMode).toBe('cpm');
    expect(setArg.storyPoints).toBeNull();
    expect(setArg.sprintId).toBeNull();
    expect(setArg.boardColumnId).toBeNull();
    expect(setArg.backlogRank).toBeNull();
  });

  it('rejects storyPoints on a CPM task (including same-patch mode=cpm)', async () => {
    selectLimit.mockResolvedValueOnce([existingTask]);

    await expect(
      updateTask('task-1', { version: 3, storyPoints: 3 }, 'user-1'),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof BadRequestError && /storyPoints is only valid for agile/.test((err as Error).message),
    );

    selectLimit.mockResolvedValueOnce([
      { ...existingTask, schedulingMode: 'agile' },
    ]);
    await expect(
      updateTask('task-1', { version: 3, schedulingMode: 'cpm', storyPoints: 3 }, 'user-1'),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof BadRequestError && /storyPoints is only valid for agile/.test((err as Error).message),
    );
  });

  it('rejects durationMinutes on an agile task (including same-patch mode=agile)', async () => {
    selectLimit.mockResolvedValueOnce([{ ...existingTask, schedulingMode: 'agile' }]);

    await expect(
      updateTask('task-1', { version: 3, durationMinutes: 120 }, 'user-1'),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof BadRequestError && /durationMinutes is only valid for CPM/.test((err as Error).message),
    );

    selectLimit.mockResolvedValueOnce([existingTask]);
    hasDependencies.mockResolvedValueOnce(false);
    await expect(
      updateTask('task-1', { version: 3, schedulingMode: 'agile', durationMinutes: 120 }, 'user-1'),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof BadRequestError && /durationMinutes is only valid for CPM/.test((err as Error).message),
    );
  });

  it('throws 409 on version mismatch', async () => {
    selectLimit
      .mockResolvedValueOnce([existingTask])
      .mockResolvedValueOnce([{ ...existingTask, version: 9 }]);
    hasDependencies.mockResolvedValueOnce(false);
    updateReturning.mockResolvedValueOnce([]);

    await expect(
      updateTask('task-1', { version: 3, schedulingMode: 'agile' }, 'user-1'),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
