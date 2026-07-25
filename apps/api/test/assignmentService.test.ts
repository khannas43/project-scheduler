import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BadRequestError, ConflictError } from '../src/middleware/errors.js';

const writeAuditLog = vi.fn();
const withSerializableRetry = vi.fn(
  async (fn: (tx: unknown) => Promise<unknown>, _db?: unknown) => {
    void _db;
    return fn(tx);
  },
);

const selectLimit = vi.fn();
const insertReturning = vi.fn();
const selectWhereLimit = vi.fn();

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
    where: vi.fn(),
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(),
      })),
    })),
  })),
};

vi.mock('../src/db/client.js', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: selectWhereLimit,
          orderBy: vi.fn(),
        })),
        orderBy: vi.fn(),
        innerJoin: vi.fn(() => ({
          where: vi.fn(),
        })),
      })),
    })),
  },
}));

vi.mock('../src/services/scheduleRunner.js', () => ({
  withSerializableRetry: (fn: (tx: unknown) => Promise<unknown>, dbArg: unknown) =>
    withSerializableRetry(fn, dbArg),
  writeAuditLog: (...args: unknown[]) => writeAuditLog(...args),
}));

const {
  computeWorkAndCost,
  createAssignment,
  findOverallocatedDays,
  eachUtcDayInclusive,
} = await import('../src/services/assignmentService.js');
const { numericFromDb, numericToDb } = await import('../src/services/resourceService.js');

describe('computeWorkAndCost', () => {
  it('computes work and cost from duration, units, and standard rate', () => {
    const result = computeWorkAndCost(
      { durationMinutes: 480 },
      { standardRate: '60', costPerUse: null },
      1,
    );
    expect(result.workMinutes).toBe(480);
    expect(result.cost).toBe(480); // 8h * $60
  });

  it('scales work by units and includes costPerUse', () => {
    const result = computeWorkAndCost(
      { durationMinutes: 480 },
      { standardRate: '100', costPerUse: '50' },
      0.5,
    );
    expect(result.workMinutes).toBe(240);
    expect(result.cost).toBe(400 + 50); // 4h * $100 + $50
  });

  it('handles a zero-rate resource', () => {
    const result = computeWorkAndCost(
      { durationMinutes: 120 },
      { standardRate: '0', costPerUse: null },
      1,
    );
    expect(result.workMinutes).toBe(120);
    expect(result.cost).toBe(0);
  });

  it('handles a resource with only costPerUse set', () => {
    const result = computeWorkAndCost(
      { durationMinutes: 60 },
      { standardRate: null, costPerUse: '25' },
      2,
    );
    expect(result.workMinutes).toBe(120);
    expect(result.cost).toBe(25);
  });

  it('treats null duration as zero', () => {
    const result = computeWorkAndCost(
      { durationMinutes: null },
      { standardRate: '10', costPerUse: null },
      1,
    );
    expect(result.workMinutes).toBe(0);
    expect(result.cost).toBe(0);
  });
});

describe('numeric string round-trip (resources/assignments)', () => {
  it('String()s JS numbers on the way into Drizzle numeric() columns', () => {
    expect(numericToDb(1)).toBe('1');
    expect(numericToDb(75.5)).toBe('75.5');
    expect(numericToDb(0)).toBe('0');
    expect(numericToDb(null)).toBeNull();
    expect(numericToDb(undefined)).toBeUndefined();
  });

  it('Number()s Drizzle numeric() strings on the way out for computation', () => {
    expect(numericFromDb('50')).toBe(50);
    expect(typeof numericFromDb('50')).toBe('number');
    expect(numericFromDb('1.25')).toBe(1.25);
    expect(numericFromDb(null)).toBeNull();
  });

  it('round-trips a rate through String → Number without losing magnitude', () => {
    const original = 87.5;
    expect(numericFromDb(numericToDb(original) as string)).toBe(original);
  });
});

describe('findOverallocatedDays', () => {
  it('flags calendar days where summed units exceed maxUnits', () => {
    // Two 100% assignments overlapping on Jan 6–7.
    const over = findOverallocatedDays(1, [
      {
        units: 1,
        earlyStart: new Date('2026-01-05T09:00:00.000Z'),
        earlyFinish: new Date('2026-01-07T17:00:00.000Z'),
      },
      {
        units: 1,
        earlyStart: new Date('2026-01-06T09:00:00.000Z'),
        earlyFinish: new Date('2026-01-08T17:00:00.000Z'),
      },
    ]);

    expect(over.map((d) => d.date)).toEqual(['2026-01-06', '2026-01-07']);
    expect(over.every((d) => d.totalUnits === 2 && d.maxUnits === 1)).toBe(true);
  });

  it('returns empty when under the ceiling', () => {
    expect(
      findOverallocatedDays(1, [
        {
          units: 0.5,
          earlyStart: new Date('2026-01-05T00:00:00.000Z'),
          earlyFinish: new Date('2026-01-05T23:00:00.000Z'),
        },
      ]),
    ).toEqual([]);
  });
});

describe('eachUtcDayInclusive', () => {
  it('includes both endpoints as UTC calendar days', () => {
    expect(
      eachUtcDayInclusive(
        new Date('2026-01-05T09:00:00.000Z'),
        new Date('2026-01-07T17:00:00.000Z'),
      ),
    ).toEqual(['2026-01-05', '2026-01-06', '2026-01-07']);
  });
});

describe('createAssignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withSerializableRetry.mockImplementation(
      async (fn: (txArg: unknown) => Promise<unknown>, _db?: unknown) => {
        void _db;
        return fn(tx);
      },
    );
  });

  it('rethrows unique-violation as ConflictError', async () => {
    selectLimit
      .mockResolvedValueOnce([
        {
          id: 'task-1',
          projectId: 'proj-1',
          durationMinutes: 480,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'res-1',
          resourceType: 'work',
          standardRate: '50',
          costPerUse: null,
        },
      ]);

    const uniqueError = Object.assign(new Error('duplicate'), { code: '23505' });
    insertReturning.mockRejectedValueOnce(uniqueError);

    await expect(
      createAssignment(
        {
          taskId: '11111111-1111-4111-8111-111111111111',
          resourceId: '22222222-2222-4222-8222-222222222222',
          units: 1,
        },
        'user-1',
      ),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ConflictError && err.message === 'Resource already assigned to this task',
    );
  });

  it('rejects explicit units on a material resource', async () => {
    selectLimit
      .mockResolvedValueOnce([
        {
          id: 'task-1',
          projectId: 'proj-1',
          durationMinutes: 480,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'res-mat',
          resourceType: 'material',
          standardRate: null,
          costPerUse: '10',
        },
      ]);

    await expect(
      createAssignment(
        {
          taskId: '11111111-1111-4111-8111-111111111111',
          resourceId: '22222222-2222-4222-8222-222222222222',
          units: 0.5,
        },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});
