import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BadRequestError, NotFoundError } from '../src/middleware/errors.js';

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
const countTasksInColumn = vi.fn();

const existingAgile = {
  id: 'task-1',
  projectId: 'proj-1',
  schedulingMode: 'agile',
  boardColumnId: null as string | null,
  backlogRank: 'a0',
  version: 1,
};

let selectLimit: ReturnType<typeof vi.fn>;
let updateReturning: ReturnType<typeof vi.fn>;
let updateSet: ReturnType<typeof vi.fn>;
let tx: { select: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };

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
vi.mock('../src/services/boardColumnService.js', () => ({
  countTasksInColumn: (...args: unknown[]) => countTasksInColumn(...args),
  listBoardColumns: vi.fn(),
  createBoardColumn: vi.fn(),
  updateBoardColumn: vi.fn(),
  deleteBoardColumn: vi.fn(),
}));

const { moveTaskBoardColumn } = await import('../src/services/taskService.js');

describe('moveTaskBoardColumn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectLimit = vi.fn();
    updateReturning = vi.fn();
    updateSet = vi.fn(() => ({
      where: vi.fn(() => ({ returning: updateReturning })),
    }));
    tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: selectLimit,
          })),
        })),
      })),
      update: vi.fn(() => ({ set: updateSet })),
    };
    withSerializableRetry.mockImplementation(async (fn) => fn(tx));
  });

  it('rejects non-agile tasks', async () => {
    selectLimit.mockResolvedValueOnce([{ ...existingAgile, schedulingMode: 'cpm' }]);

    await expect(moveTaskBoardColumn('task-1', 'col-1', 'user-1')).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof BadRequestError && /Only agile tasks/.test((err as Error).message),
    );
  });

  it('rejects a column from another project', async () => {
    selectLimit
      .mockResolvedValueOnce([existingAgile])
      .mockResolvedValueOnce([{ id: 'col-1', projectId: 'other', wipLimit: null }]);

    await expect(moveTaskBoardColumn('task-1', 'col-1', 'user-1')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('rejects when WIP limit would be exceeded', async () => {
    selectLimit
      .mockResolvedValueOnce([existingAgile])
      .mockResolvedValueOnce([{ id: 'col-1', projectId: 'proj-1', wipLimit: 2 }]);
    countTasksInColumn.mockResolvedValueOnce(2);

    await expect(moveTaskBoardColumn('task-1', 'col-1', 'user-1')).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof BadRequestError && /WIP limit/.test((err as Error).message),
    );
  });

  it('moves into a column under the WIP limit', async () => {
    selectLimit
      .mockResolvedValueOnce([existingAgile])
      .mockResolvedValueOnce([{ id: 'col-1', projectId: 'proj-1', wipLimit: 3 }]);
    countTasksInColumn.mockResolvedValueOnce(1);
    const updated = { ...existingAgile, boardColumnId: 'col-1' };
    updateReturning.mockResolvedValueOnce([updated]);

    await expect(moveTaskBoardColumn('task-1', 'col-1', 'user-1')).resolves.toEqual(updated);
    expect(updateSet).toHaveBeenCalledWith({ boardColumnId: 'col-1' });
  });
});
