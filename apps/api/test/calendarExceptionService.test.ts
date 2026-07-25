import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BadRequestError } from '../src/middleware/errors.js';

const rescheduleProject = vi.fn();
const writeAuditLog = vi.fn();
const withSerializableRetry = vi.fn(
  async (fn: (tx: unknown) => Promise<unknown>, _db?: unknown) => {
    void _db;
    return fn(tx);
  },
);

const selectLimit = vi.fn();
const insertReturning = vi.fn();
const deleteWhere = vi.fn();

const tx = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: selectLimit,
      })),
    })),
  })),
  insert: vi.fn(() => ({
    values: vi.fn(() => ({
      returning: insertReturning,
    })),
  })),
  delete: vi.fn(() => ({
    where: deleteWhere,
  })),
};

vi.mock('../src/db/client.js', () => ({
  db: {},
}));

vi.mock('../src/services/scheduleRunner.js', () => ({
  withSerializableRetry: (fn: (tx: unknown) => Promise<unknown>, dbArg: unknown) =>
    withSerializableRetry(fn, dbArg),
  rescheduleProject: (...args: unknown[]) => rescheduleProject(...args),
  writeAuditLog: (...args: unknown[]) => writeAuditLog(...args),
}));

const { createException, deleteException } = await import(
  '../src/services/calendarExceptionService.js'
);

const projectCalendar = {
  id: 'cal-1',
  name: 'Project cal',
  projectId: 'proj-1',
  workingDays: [1, 2, 3, 4, 5],
  hoursPerDay: '8',
  defaultStart: '09:00:00',
  defaultFinish: '17:00:00',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const globalCalendar = {
  ...projectCalendar,
  id: 'cal-global',
  projectId: null,
};

const createdException = {
  id: 'ex-1',
  calendarId: 'cal-1',
  exceptionDate: '2024-12-25',
  isWorking: false,
  startTime: null,
  finishTime: null,
  name: 'Christmas',
  recurrence: { type: 'annual' },
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('calendarExceptionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withSerializableRetry.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(tx),
    );
    rescheduleProject.mockResolvedValue({
      task: null,
      affected: [{ id: 'task-1', isCritical: true }],
      projectVersion: 7,
      warnings: [],
    });
    writeAuditLog.mockResolvedValue(undefined);
  });

  it('rejects managing exceptions on a global template calendar with 400', async () => {
    selectLimit.mockResolvedValueOnce([globalCalendar]);

    let caught: unknown;
    try {
      await createException(
        'cal-global',
        { exceptionDate: '2024-12-25', isWorking: false },
        'user-1',
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BadRequestError);
    expect(caught).toMatchObject({
      status: 400,
      message: 'Cannot manage exceptions on a global template calendar',
    });
    expect(rescheduleProject).not.toHaveBeenCalled();
  });

  it('createException reschedules and returns the bumped projectVersion / affected set', async () => {
    selectLimit.mockResolvedValueOnce([projectCalendar]);
    insertReturning.mockResolvedValueOnce([createdException]);

    const result = await createException(
      'cal-1',
      {
        exceptionDate: '2024-12-25',
        isWorking: false,
        name: 'Christmas',
        recurrence: { type: 'annual' },
      },
      'user-1',
    );

    expect(rescheduleProject).toHaveBeenCalledWith(tx, 'proj-1');
    expect(result.projectVersion).toBe(7);
    expect(result.task).toBeNull();
    expect(result.affected).toEqual([{ id: 'task-1', isCritical: true }]);
    expect(result.exception.id).toBe('ex-1');
    expect(writeAuditLog).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'calendar_exception.create',
        projectId: 'proj-1',
        entityId: 'ex-1',
      }),
    );
  });

  it('deleteException reschedules and returns the MutationResult from rescheduleProject', async () => {
    selectLimit
      .mockResolvedValueOnce([createdException])
      .mockResolvedValueOnce([projectCalendar]);
    deleteWhere.mockResolvedValueOnce(undefined);
    rescheduleProject.mockResolvedValueOnce({
      task: null,
      affected: [{ id: 'task-2' }],
      projectVersion: 9,
      warnings: [],
    });

    const result = await deleteException('ex-1', 'user-1');

    expect(rescheduleProject).toHaveBeenCalledWith(tx, 'proj-1');
    expect(result.projectVersion).toBe(9);
    expect(result.affected).toEqual([{ id: 'task-2' }]);
    expect(writeAuditLog).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'calendar_exception.delete',
        projectId: 'proj-1',
        entityId: 'ex-1',
      }),
    );
  });

  it('deleteException rejects a global-template calendar with 400', async () => {
    selectLimit
      .mockResolvedValueOnce([{ ...createdException, calendarId: 'cal-global' }])
      .mockResolvedValueOnce([globalCalendar]);

    await expect(deleteException('ex-1', 'user-1')).rejects.toMatchObject({
      status: 400,
      message: 'Cannot manage exceptions on a global template calendar',
    });
    expect(rescheduleProject).not.toHaveBeenCalled();
  });
});
