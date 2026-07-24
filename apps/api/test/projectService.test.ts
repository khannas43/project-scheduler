import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConflictError } from '../src/middleware/errors.js';

const projectA = {
  id: 'proj-a',
  name: 'Alpha',
  description: null,
  status: 'active',
  startDate: null,
  finishDate: null,
  calendarId: 'cal-1',
  ownerId: 'user-1',
  isArchived: false,
  version: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

type MockFns = {
  select: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
};

vi.mock('../src/db/client.js', () => {
  const where = vi.fn();
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin, where }));
  const select = vi.fn(() => ({ from }));
  return {
    db: {
      select,
      __mocks: { select, from, innerJoin, where } satisfies MockFns,
    },
  };
});

const { listProjectsForUser } = await import('../src/services/projectService.js');
const { db } = await import('../src/db/client.js');

function mocks(): MockFns {
  return (db as unknown as { __mocks: MockFns }).__mocks;
}

describe('listProjectsForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const m = mocks();
    m.from.mockReturnValue({ innerJoin: m.innerJoin, where: m.where });
    m.innerJoin.mockReturnValue({ where: m.where });
  });

  it('returns only projects the user is a member of', async () => {
    mocks().where.mockResolvedValueOnce([{ project: projectA }]);

    const result = await listProjectsForUser('user-1');

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('proj-a');
    expect(result.map((p) => p.id)).not.toContain('proj-b');
  });

  it('returns an empty list when the user has no memberships', async () => {
    mocks().where.mockResolvedValueOnce([]);

    const result = await listProjectsForUser('user-nobody');
    expect(result).toEqual([]);
  });
});

describe('project version conflict (§9.1)', () => {
  it('ConflictError carries the current server-side project row for the 409 body', () => {
    const current = { ...projectA, version: 4, name: 'Renamed by peer' };
    const err = new ConflictError('Project version conflict', current);
    expect(err.status).toBe(409);
    expect(err.code).toBe('conflict');
    expect(err.current).toEqual(current);
  });
});
