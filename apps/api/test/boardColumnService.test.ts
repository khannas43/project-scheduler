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
const insertReturning = vi.fn();
const updateReturning = vi.fn();
const updateSet = vi.fn(() => ({
  where: vi.fn(() => ({ returning: updateReturning })),
}));
const deleteWhere = vi.fn();

const tx = {
  select: vi.fn(),
  insert: vi.fn(() => ({
    values: vi.fn(() => ({ returning: insertReturning })),
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
          orderBy: vi.fn(),
        })),
        orderBy: vi.fn(),
      })),
    })),
  },
}));

vi.mock('../src/services/scheduleRunner.js', () => ({
  withSerializableRetry: (fn: (tx: unknown) => Promise<unknown>, dbArg: unknown) =>
    withSerializableRetry(fn, dbArg),
  writeAuditLog: (...args: unknown[]) => writeAuditLog(...args),
}));

const { createBoardColumn, updateBoardColumn, deleteBoardColumn } = await import(
  '../src/services/boardColumnService.js'
);

const columnRow = {
  id: 'col-1',
  projectId: 'proj-1',
  name: 'To Do',
  sortOrder: 0,
  wipLimit: 5,
  version: 0,
};

describe('boardColumnService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withSerializableRetry.mockImplementation(
      async (fn: (txArg: unknown) => Promise<unknown>, _db?: unknown) => {
        void _db;
        return fn(tx);
      },
    );
  });

  it('createBoardColumn inserts a column', async () => {
    let selectCall = 0;
    tx.select.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => {
            selectCall += 1;
            return selectCall === 1 ? [{ id: 'proj-1' }] : [];
          }),
        })),
      })),
    }));
    insertReturning.mockResolvedValueOnce([columnRow]);

    const created = await createBoardColumn(
      'proj-1',
      { name: 'To Do', sortOrder: 0, wipLimit: 5 },
      'user-1',
    );
    expect(created).toEqual(columnRow);
    expect(writeAuditLog).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'board_column.create' }),
    );
  });

  it('updateBoardColumn throws 409 on version mismatch', async () => {
    let selectCall = 0;
    tx.select.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => {
            selectCall += 1;
            if (selectCall === 1) return [columnRow];
            return [{ ...columnRow, version: 9 }];
          }),
        })),
      })),
    }));
    updateReturning.mockResolvedValueOnce([]);

    await expect(
      updateBoardColumn('col-1', { version: 0, name: 'Doing' }, 'user-1'),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('deleteBoardColumn 404s when missing', async () => {
    tx.select.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => []),
        })),
      })),
    }));

    await expect(deleteBoardColumn('missing', 'user-1')).rejects.toBeInstanceOf(NotFoundError);
  });
});
