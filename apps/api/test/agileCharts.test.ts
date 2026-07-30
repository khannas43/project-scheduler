import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotFoundError } from '../src/middleware/errors.js';

const selectMock = vi.fn();

vi.mock('../src/db/client.js', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
  },
}));

vi.mock('../src/services/scheduleRunner.js', () => ({
  withSerializableRetry: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock('../src/services/backlogRank.js', () => ({
  maxBacklogRank: vi.fn(),
  nextBacklogRank: vi.fn(),
}));

const { getProjectVelocity, getSprintPointsSummary } = await import(
  '../src/services/sprintService.js'
);

const PROJECT = 'proj-1';
const SPRINT_A = 'sprint-a';
const SPRINT_B = 'sprint-b';

/** Drizzle awaitable query builder that resolves to `result`. */
function awaitableWhere(result: unknown) {
  const promise = Promise.resolve(result);
  return {
    limit: vi.fn(async () => result),
    orderBy: vi.fn(async () => result),
    then: promise.then.bind(promise),
  };
}

describe('getProjectVelocity', () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it('returns an empty array when there are no closed sprints', async () => {
    selectMock
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => awaitableWhere([{ id: PROJECT }])),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(async () => []),
          })),
        })),
      });

    await expect(getProjectVelocity(PROJECT)).resolves.toEqual([]);
  });

  it('sums story points only for closed sprints, ordered by endDate', async () => {
    const closed = [
      {
        id: SPRINT_A,
        name: 'Sprint A',
        projectId: PROJECT,
        state: 'closed',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-01-14T00:00:00.000Z'),
      },
      {
        id: SPRINT_B,
        name: 'Sprint B',
        projectId: PROJECT,
        state: 'closed',
        startDate: new Date('2026-01-15T00:00:00.000Z'),
        endDate: new Date('2026-01-28T00:00:00.000Z'),
      },
    ];

    selectMock
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => awaitableWhere([{ id: PROJECT }])),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(async () => closed),
          })),
        })),
      })
      // tasks for sprint A
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(async () => [
            { storyPoints: '5' },
            { storyPoints: '3' },
            { storyPoints: null },
          ]),
        })),
      })
      // tasks for sprint B
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(async () => [{ storyPoints: '8' }]),
        })),
      });

    const rows = await getProjectVelocity(PROJECT);
    expect(rows).toEqual([
      {
        sprintId: SPRINT_A,
        sprintName: 'Sprint A',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-01-14T00:00:00.000Z',
        completedPoints: 8,
      },
      {
        sprintId: SPRINT_B,
        sprintName: 'Sprint B',
        startDate: '2026-01-15T00:00:00.000Z',
        endDate: '2026-01-28T00:00:00.000Z',
        completedPoints: 8,
      },
    ]);
  });

  it('404s when the project is missing', async () => {
    selectMock.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => awaitableWhere([])),
      })),
    });

    await expect(getProjectVelocity('missing')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('getSprintPointsSummary', () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it('sums total/completed/remaining across done, not-done, and no-column tasks', async () => {
    const sprint = {
      id: SPRINT_A,
      projectId: PROJECT,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-01-14T00:00:00.000Z'),
    };

    selectMock
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => awaitableWhere([sprint])),
        })),
      })
      // done columns
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(async () => [{ id: 'col-done' }]),
        })),
      })
      // leaf tasks
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(async () => [
            { storyPoints: '5', boardColumnId: 'col-done' },
            { storyPoints: '3', boardColumnId: 'col-todo' },
            { storyPoints: '2', boardColumnId: null },
            { storyPoints: null, boardColumnId: 'col-done' },
          ]),
        })),
      });

    await expect(getSprintPointsSummary(SPRINT_A)).resolves.toEqual({
      sprintId: SPRINT_A,
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-14T00:00:00.000Z',
      totalPoints: 10,
      completedPoints: 5,
      remainingPoints: 5,
    });
  });

  it('returns zeros without division errors when the sprint is empty', async () => {
    const sprint = {
      id: SPRINT_A,
      projectId: PROJECT,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-01-14T00:00:00.000Z'),
    };

    selectMock
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => awaitableWhere([sprint])),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(async () => []),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(async () => []),
        })),
      });

    await expect(getSprintPointsSummary(SPRINT_A)).resolves.toEqual({
      sprintId: SPRINT_A,
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-14T00:00:00.000Z',
      totalPoints: 0,
      completedPoints: 0,
      remainingPoints: 0,
    });
  });
});
