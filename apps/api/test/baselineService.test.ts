import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BadRequestError, NotFoundError } from '../src/middleware/errors.js';

const writeAuditLog = vi.fn();
const withSerializableRetry = vi.fn(
  async (fn: (tx: unknown) => Promise<unknown>, _db?: unknown) => {
    void _db;
    return fn(tx);
  },
);

const projectSelectLimit = vi.fn();
const existingBaselinesWhere = vi.fn();
const tasksWhere = vi.fn();
const assignmentsWhere = vi.fn();
const insertBaselineReturning = vi.fn();
const insertBaselineTasksValues = vi.fn();
const deleteWhere = vi.fn();
const clearSelectLimit = vi.fn();

let txSelectCall = 0;

const tx = {
  select: vi.fn(() => {
    txSelectCall += 1;
    const call = txSelectCall;
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => {
          // createBaseline: 1 project(+limit), 2 existing numbers, 3 tasks, 4 assignments
          // clearBaseline: 1 baseline(+limit)
          if (call === 1) return { limit: projectSelectLimit };
          if (call === 2) return existingBaselinesWhere();
          if (call === 3) return tasksWhere();
          if (call === 4) return assignmentsWhere();
          return { limit: clearSelectLimit };
        }),
      })),
    };
  }),
  insert: vi.fn(() => ({
    values: vi.fn((vals: unknown) => {
      if (Array.isArray(vals)) {
        insertBaselineTasksValues(vals);
        return Promise.resolve();
      }
      return { returning: insertBaselineReturning };
    }),
  })),
  delete: vi.fn(() => ({
    where: deleteWhere,
  })),
};

type DbSelectHandler = () => unknown;
let dbSelectHandlers: DbSelectHandler[] = [];

vi.mock('../src/db/client.js', () => ({
  db: {
    select: vi.fn(() => {
      const handler = dbSelectHandlers.shift();
      if (!handler) {
        throw new Error('Unexpected db.select() — queue a handler in the test');
      }
      return handler();
    }),
  },
}));

vi.mock('../src/services/scheduleRunner.js', () => ({
  withSerializableRetry: (fn: (tx: unknown) => Promise<unknown>, dbArg: unknown) =>
    withSerializableRetry(fn, dbArg),
  writeAuditLog: (...args: unknown[]) => writeAuditLog(...args),
}));

const {
  createBaseline,
  clearBaseline,
  getBaselineDetail,
  nextBaselineNumber,
} = await import('../src/services/baselineService.js');

describe('nextBaselineNumber', () => {
  it('returns the lowest unused slot in 0..10', () => {
    expect(nextBaselineNumber(new Set())).toBe(0);
    expect(nextBaselineNumber(new Set([0, 1, 3]))).toBe(2);
    expect(nextBaselineNumber(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))).toBeNull();
  });
});

describe('createBaseline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txSelectCall = 0;
    withSerializableRetry.mockImplementation(
      async (fn: (txArg: unknown) => Promise<unknown>, _db?: unknown) => {
        void _db;
        return fn(tx);
      },
    );
  });

  it('snapshots schedule dates and sums cost/work from assignments (not the task row)', async () => {
    const projectId = '11111111-1111-4111-8111-111111111111';
    const taskId = '22222222-2222-4222-8222-222222222222';
    const start = new Date('2026-08-14T09:00:00Z');
    const finish = new Date('2026-08-14T17:00:00Z');

    projectSelectLimit.mockResolvedValueOnce([{ id: projectId }]);
    existingBaselinesWhere.mockResolvedValueOnce([{ baselineNumber: 0 }]);
    insertBaselineReturning.mockResolvedValueOnce([
      {
        id: 'baseline-1',
        projectId,
        baselineNumber: 1,
        name: 'Initial',
        capturedBy: 'user-1',
      },
    ]);
    tasksWhere.mockResolvedValueOnce([
      {
        id: taskId,
        projectId,
        name: 'Pour foundation',
        earlyStart: start,
        earlyFinish: finish,
        durationMinutes: 480,
      },
    ]);
    assignmentsWhere.mockResolvedValueOnce([
      { taskId, workMinutes: 240, cost: '100.50' },
      { taskId, workMinutes: 120, cost: '50.25' },
    ]);

    const created = await createBaseline(projectId, 'Initial', 'user-1');

    expect(created.baselineNumber).toBe(1);
    expect(insertBaselineTasksValues).toHaveBeenCalledWith([
      expect.objectContaining({
        baselineId: 'baseline-1',
        taskId,
        start,
        finish,
        durationMinutes: 480,
        workMinutes: 360,
        cost: '150.75',
      }),
    ]);
    expect(writeAuditLog).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'baseline.save',
        entityType: 'baseline',
        entityId: 'baseline-1',
      }),
    );
  });

  it('rejects with BadRequestError when all 11 slots (0..10) are taken', async () => {
    projectSelectLimit.mockResolvedValueOnce([{ id: 'proj' }]);
    existingBaselinesWhere.mockResolvedValueOnce(
      Array.from({ length: 11 }, (_, i) => ({ baselineNumber: i })),
    );

    await expect(createBaseline('proj', 'Overflow', 'user-1')).rejects.toBeInstanceOf(
      BadRequestError,
    );
    expect(insertBaselineReturning).not.toHaveBeenCalled();
  });
});

describe('getBaselineDetail variances', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbSelectHandlers = [];
  });

  it('computes current − baseline; null when either side is null', async () => {
    const baselineId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const taskId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const baselineStart = new Date('2026-08-14T09:00:00Z');
    const currentStart = new Date('2026-08-14T11:00:00Z');
    const baselineFinish = new Date('2026-08-14T17:00:00Z');
    const currentFinish = new Date('2026-08-15T17:00:00Z');

    dbSelectHandlers.push(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              id: baselineId,
              projectId: 'proj',
              baselineNumber: 0,
              name: 'BL0',
            },
          ],
        }),
      }),
    }));
    dbSelectHandlers.push(() => ({
      from: () => ({
        innerJoin: () => ({
          where: async () => [
            {
              snap: {
                taskId,
                start: baselineStart,
                finish: baselineFinish,
                durationMinutes: 480,
                workMinutes: 480,
                cost: '200',
              },
              task: {
                id: taskId,
                name: 'Task A',
                earlyStart: currentStart,
                earlyFinish: currentFinish,
                durationMinutes: 600,
              },
            },
            {
              snap: {
                taskId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                start: null,
                finish: baselineFinish,
                durationMinutes: null,
                workMinutes: null,
                cost: null,
              },
              task: {
                id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                name: 'Task B',
                earlyStart: currentStart,
                earlyFinish: currentFinish,
                durationMinutes: 60,
              },
            },
          ],
        }),
      }),
    }));
    dbSelectHandlers.push(() => ({
      from: () => ({
        where: async () => [{ taskId, workMinutes: 100, cost: '250' }],
      }),
    }));

    const detail = await getBaselineDetail(baselineId);

    const a = detail.tasks.find((t) => t.taskId === taskId);
    expect(a).toMatchObject({
      startVarianceMinutes: 120,
      finishVarianceMinutes: 1440,
      durationVarianceMinutes: 120,
      costVariance: 50,
      baselineCost: 200,
      currentCost: 250,
    });

    const b = detail.tasks.find((t) => t.taskId === 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    expect(b?.startVarianceMinutes).toBeNull();
    expect(b?.durationVarianceMinutes).toBeNull();
    expect(b?.costVariance).toBeNull();
  });
});

describe('clearBaseline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txSelectCall = 0;
    withSerializableRetry.mockImplementation(
      async (fn: (txArg: unknown) => Promise<unknown>, _db?: unknown) => {
        void _db;
        return fn(tx);
      },
    );
  });

  it('deletes and audit-logs baseline.clear', async () => {
    projectSelectLimit.mockResolvedValueOnce([
      { id: 'baseline-1', projectId: 'proj', baselineNumber: 0, name: 'BL0' },
    ]);

    await clearBaseline('baseline-1', 'user-1');

    expect(deleteWhere).toHaveBeenCalled();
    expect(writeAuditLog).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'baseline.clear',
        entityId: 'baseline-1',
      }),
    );
  });

  it('throws NotFoundError when missing', async () => {
    projectSelectLimit.mockResolvedValueOnce([]);
    await expect(clearBaseline('missing', 'user-1')).rejects.toBeInstanceOf(NotFoundError);
  });
});
