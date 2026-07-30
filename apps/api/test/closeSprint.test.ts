import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BadRequestError, NotFoundError } from '../src/middleware/errors.js';

const writeAuditLog = vi.fn();
const withSerializableRetry = vi.fn(
  async (fn: (txArg: unknown) => Promise<unknown>, _db?: unknown) => {
    void _db;
    return fn({});
  },
);
const maxBacklogRank = vi.fn();
const nextBacklogRank = vi.fn();

vi.mock('../src/db/client.js', () => ({ db: {} }));
vi.mock('../src/services/scheduleRunner.js', () => ({
  withSerializableRetry: (fn: (tx: unknown) => Promise<unknown>, dbArg: unknown) =>
    withSerializableRetry(fn, dbArg),
  writeAuditLog: (...args: unknown[]) => writeAuditLog(...args),
}));
vi.mock('../src/services/backlogRank.js', () => ({
  maxBacklogRank: (...args: unknown[]) => maxBacklogRank(...args),
  nextBacklogRank: (...args: unknown[]) => nextBacklogRank(...args),
}));

const { closeSprint } = await import('../src/services/sprintService.js');

const sprint = {
  id: 'sprint-1',
  projectId: 'proj-1',
  name: 'Sprint 1',
  state: 'active',
  version: 2,
};

describe('closeSprint', () => {
  let tx: {
    select: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let updateSetCalls: Array<Record<string, unknown>>;

  beforeEach(() => {
    vi.clearAllMocks();
    updateSetCalls = [];
    maxBacklogRank.mockResolvedValue('a0');
    nextBacklogRank.mockReturnValueOnce('a1').mockReturnValueOnce('a2');

    const doneCols = [{ id: 'col-done' }];
    const sprintTasks = [
      {
        id: 'done-1',
        projectId: 'proj-1',
        sprintId: 'sprint-1',
        boardColumnId: 'col-done',
        isSummary: false,
      },
      {
        id: 'todo-1',
        projectId: 'proj-1',
        sprintId: 'sprint-1',
        boardColumnId: 'col-todo',
        isSummary: false,
      },
      {
        id: 'none-1',
        projectId: 'proj-1',
        sprintId: 'sprint-1',
        boardColumnId: null,
        isSummary: false,
      },
      {
        id: 'epic-1',
        projectId: 'proj-1',
        sprintId: 'sprint-1',
        boardColumnId: null,
        isSummary: true,
      },
    ];

    let selectCall = 0;
    tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => {
            selectCall += 1;
            // 1: existing sprint, 2: done columns, 3: sprint tasks
            // (carry-over dest select only when destination set)
            if (selectCall === 1) {
              return { limit: vi.fn(async () => [sprint]) };
            }
            if (selectCall === 2) {
              return Promise.resolve(doneCols);
            }
            return Promise.resolve(sprintTasks);
          }),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((values: Record<string, unknown>) => {
          updateSetCalls.push(values);
          return {
            where: vi.fn(() => ({
              returning: vi.fn(async () => [{ ...sprint, state: 'closed', version: 3 }]),
            })),
          };
        }),
      })),
    };

    withSerializableRetry.mockImplementation(async (fn) => fn(tx));
  });

  it('keeps done tasks, carries incomplete with cleared column + fresh rank, closes sprint', async () => {
    const result = await closeSprint('sprint-1', null, 'user-1');

    expect(result.sprint.state).toBe('closed');
    expect(result.carriedOverTaskIds).toEqual(['todo-1', 'none-1']);
    // Two incomplete updates + one sprint close update.
    expect(updateSetCalls.length).toBe(3);
    expect(updateSetCalls[0]).toMatchObject({
      sprintId: null,
      boardColumnId: null,
      backlogRank: 'a1',
    });
    expect(updateSetCalls[1]).toMatchObject({
      sprintId: null,
      boardColumnId: null,
      backlogRank: 'a2',
    });
    expect(updateSetCalls[2]).toMatchObject({ state: 'closed' });
    expect(writeAuditLog).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'sprint.close' }),
    );
  });

  it('404s when the sprint is missing', async () => {
    tx.select.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => []),
        })),
      })),
    }));

    await expect(closeSprint('missing', null, 'user-1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects closing an already-closed sprint', async () => {
    tx.select.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ ...sprint, state: 'closed' }]),
        })),
      })),
    }));

    await expect(closeSprint('sprint-1', null, 'user-1')).rejects.toBeInstanceOf(BadRequestError);
  });
});
