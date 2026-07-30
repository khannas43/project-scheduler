import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConflictError, NotFoundError } from '../src/middleware/errors.js';

const writeAuditLog = vi.fn();
const withSerializableRetry = vi.fn(
  async (fn: (tx: unknown) => Promise<unknown>, _db?: unknown) => {
    void _db;
    return fn(tx);
  },
);

const projectSelectLimit = vi.fn();
const sprintSelectLimit = vi.fn();
const insertReturning = vi.fn();
const updateReturning = vi.fn();
const updateSet = vi.fn(() => ({
  where: vi.fn(() => ({ returning: updateReturning })),
}));
const deleteWhere = vi.fn();
const listOrderBy = vi.fn();

const tx = {
  select: vi.fn(() => ({
    from: vi.fn((table: { name?: string } | unknown) => {
      // Distinguish projects vs sprints by call order within each test.
      void table;
      return {
        where: vi.fn(() => ({
          limit: vi.fn(async () => {
            // Prefer sprint select when set for update/delete paths.
            if (sprintSelectLimit.mock.calls.length < projectSelectLimit.mock.calls.length) {
              return projectSelectLimit();
            }
            return sprintSelectLimit();
          }),
        })),
      };
    }),
  })),
  insert: vi.fn(() => ({
    values: vi.fn(() => ({
      returning: insertReturning,
    })),
  })),
  update: vi.fn(() => ({ set: updateSet })),
  delete: vi.fn(() => ({ where: deleteWhere })),
};

vi.mock('../src/db/client.js', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: projectSelectLimit,
          orderBy: listOrderBy,
        })),
        orderBy: listOrderBy,
      })),
    })),
  },
}));

vi.mock('../src/services/scheduleRunner.js', () => ({
  withSerializableRetry: (fn: (tx: unknown) => Promise<unknown>, dbArg: unknown) =>
    withSerializableRetry(fn, dbArg),
  writeAuditLog: (...args: unknown[]) => writeAuditLog(...args),
}));

const { createSprint, updateSprint, deleteSprint, listSprints } = await import(
  '../src/services/sprintService.js'
);

const sprintRow = {
  id: 'sprint-1',
  projectId: 'proj-1',
  name: 'Sprint 1',
  goal: null,
  startDate: new Date('2026-01-01T00:00:00.000Z'),
  endDate: new Date('2026-01-15T00:00:00.000Z'),
  capacity: '40',
  state: 'planned',
  version: 0,
};

describe('sprintService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withSerializableRetry.mockImplementation(
      async (fn: (txArg: unknown) => Promise<unknown>, _db?: unknown) => {
        void _db;
        return fn(tx);
      },
    );
    // Reset select multiplexing: first limit call → project, subsequent → sprint.
    let selectCall = 0;
    tx.select.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => {
            selectCall += 1;
            if (selectCall === 1) return projectSelectLimit();
            return sprintSelectLimit();
          }),
        })),
      })),
    }));
  });

  it('createSprint inserts a planned sprint', async () => {
    projectSelectLimit.mockResolvedValueOnce([{ id: 'proj-1' }]);
    insertReturning.mockResolvedValueOnce([sprintRow]);

    const created = await createSprint(
      'proj-1',
      {
        name: 'Sprint 1',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-01-15T00:00:00.000Z',
        capacity: 40,
      },
      'user-1',
    );

    expect(created).toEqual(sprintRow);
    expect(writeAuditLog).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'sprint.create', entityId: 'sprint-1' }),
    );
  });

  it('listSprints 404s when the project is missing', async () => {
    projectSelectLimit.mockResolvedValueOnce([]);
    await expect(listSprints('missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('updateSprint throws 409 on version mismatch', async () => {
    // updateSprint: first select = existing sprint; on miss, second select = current.
    let selectCall = 0;
    tx.select.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => {
            selectCall += 1;
            if (selectCall === 1) return [sprintRow];
            return [{ ...sprintRow, version: 5 }];
          }),
        })),
      })),
    }));
    updateReturning.mockResolvedValueOnce([]);

    await expect(
      updateSprint('sprint-1', { version: 0, name: 'Renamed' }, 'user-1'),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('deleteSprint removes the row', async () => {
    let selectCall = 0;
    tx.select.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => {
            selectCall += 1;
            return selectCall === 1 ? [sprintRow] : [];
          }),
        })),
      })),
    }));
    deleteWhere.mockResolvedValueOnce(undefined);

    await expect(deleteSprint('sprint-1', 'user-1')).resolves.toEqual({ deleted: true });
    expect(writeAuditLog).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'sprint.delete', entityId: 'sprint-1' }),
    );
  });
});
