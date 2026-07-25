import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BadRequestError } from '../src/middleware/errors.js';

const writeAuditLog = vi.fn();
const withSerializableRetry = vi.fn(
  async (fn: (tx: unknown) => Promise<unknown>, _db?: unknown) => {
    void _db;
    return fn(tx);
  },
);

const selectLimit = vi.fn();
const assignmentSelectLimit = vi.fn();
const deleteWhere = vi.fn();

let selectCall = 0;

const tx = {
  select: vi.fn(() => {
    selectCall += 1;
    // First select in deleteResource is the resource; second is assignments check.
    const limitFn = selectCall % 2 === 1 ? selectLimit : assignmentSelectLimit;
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: limitFn,
        })),
      })),
    };
  }),
  delete: vi.fn(() => ({
    where: deleteWhere,
  })),
  insert: vi.fn(),
  update: vi.fn(),
};

vi.mock('../src/db/client.js', () => ({
  db: {},
}));

vi.mock('../src/services/scheduleRunner.js', () => ({
  withSerializableRetry: (fn: (tx: unknown) => Promise<unknown>, dbArg: unknown) =>
    withSerializableRetry(fn, dbArg),
  writeAuditLog: (...args: unknown[]) => writeAuditLog(...args),
}));

const { deleteResource, numericToDb } = await import('../src/services/resourceService.js');

describe('deleteResource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCall = 0;
    withSerializableRetry.mockImplementation(
      async (fn: (txArg: unknown) => Promise<unknown>, _db?: unknown) => {
        void _db;
        return fn(tx);
      },
    );
  });

  it('rejects delete when the resource still has assignments', async () => {
    selectLimit.mockResolvedValueOnce([
      {
        id: 'res-1',
        name: 'Alice',
        resourceType: 'work',
      },
    ]);
    assignmentSelectLimit.mockResolvedValueOnce([{ id: 'asg-1' }]);

    await expect(deleteResource('res-1', 'user-1', 'proj-1')).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof BadRequestError &&
        /Cannot delete a resource with existing assignments/.test(err.message),
    );
    expect(deleteWhere).not.toHaveBeenCalled();
  });

  it('deletes when there are no assignments', async () => {
    selectLimit.mockResolvedValueOnce([
      {
        id: 'res-1',
        name: 'Alice',
        resourceType: 'work',
      },
    ]);
    assignmentSelectLimit.mockResolvedValueOnce([]);
    deleteWhere.mockResolvedValueOnce(undefined);

    await expect(deleteResource('res-1', 'user-1', 'proj-1')).resolves.toEqual({ deleted: true });
    expect(writeAuditLog).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'resource.delete', entityId: 'res-1' }),
    );
  });
});

describe('resource numeric insert values', () => {
  it('converts create-input numbers to strings for numeric() columns', () => {
    expect(numericToDb(1.0)).toBe('1');
    expect(numericToDb(120.25)).toBe('120.25');
  });
});
