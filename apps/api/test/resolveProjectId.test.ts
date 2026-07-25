import { beforeEach, describe, expect, it, vi } from 'vitest';

const limit = vi.fn();
const chain = {
  from: vi.fn(),
  where: vi.fn(),
  innerJoin: vi.fn(),
  limit,
};
chain.from.mockReturnValue(chain);
chain.where.mockReturnValue(chain);
chain.innerJoin.mockReturnValue(chain);

vi.mock('../src/db/client.js', () => ({
  db: {
    select: vi.fn(() => chain),
  },
}));

vi.mock('../src/services/permissionService.js', () => ({
  getEffectivePermissions: vi.fn(),
}));

const { resolveProjectId } = await import('../src/middleware/permissions.js');
const { db } = await import('../src/db/client.js');

function mockRequest(partial: {
  url: string;
  id?: string;
  body?: unknown;
}): Parameters<typeof resolveProjectId>[0] {
  return {
    params: partial.id !== undefined ? { id: partial.id } : {},
    body: partial.body,
    routeOptions: { url: partial.url },
  } as Parameters<typeof resolveProjectId>[0];
}

describe('resolveProjectId — dependency branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chain.from.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    chain.innerJoin.mockReturnValue(chain);
  });

  it('POST /api/dependencies resolves via body.predecessorId → tasks.projectId', async () => {
    limit.mockResolvedValueOnce([{ projectId: 'proj-1' }]);

    const projectId = await resolveProjectId(
      mockRequest({
        url: '/api/dependencies',
        body: {
          predecessorId: '11111111-1111-4111-8111-111111111111',
          successorId: '22222222-2222-4222-8222-222222222222',
          linkType: 'FS',
        },
      }),
    );

    expect(projectId).toBe('proj-1');
    expect(db.select).toHaveBeenCalled();
  });

  it('POST /api/dependencies returns undefined for a malformed body (fail-closed)', async () => {
    const projectId = await resolveProjectId(
      mockRequest({
        url: '/api/dependencies',
        body: { successorId: '22222222-2222-4222-8222-222222222222' },
      }),
    );
    expect(projectId).toBeUndefined();
    expect(db.select).not.toHaveBeenCalled();
  });

  it('POST /api/dependencies returns undefined when predecessorId is not a string', async () => {
    const projectId = await resolveProjectId(
      mockRequest({
        url: '/api/dependencies',
        body: { predecessorId: 123 },
      }),
    );
    expect(projectId).toBeUndefined();
  });

  it('DELETE /api/dependencies/:id resolves via dependency → predecessor → project', async () => {
    limit.mockResolvedValueOnce([{ projectId: 'proj-2' }]);

    const projectId = await resolveProjectId(
      mockRequest({
        url: '/api/dependencies/:id',
        id: '33333333-3333-4333-8333-333333333333',
      }),
    );

    expect(projectId).toBe('proj-2');
    expect(db.select).toHaveBeenCalled();
  });

  it('DELETE /api/dependencies/:id returns undefined when the dependency is missing', async () => {
    limit.mockResolvedValueOnce([]);

    const projectId = await resolveProjectId(
      mockRequest({
        url: '/api/dependencies/:id',
        id: '33333333-3333-4333-8333-333333333333',
      }),
    );

    expect(projectId).toBeUndefined();
  });
});

describe('resolveProjectId — assignment branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chain.from.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    chain.innerJoin.mockReturnValue(chain);
  });

  it('POST /api/assignments resolves via body.taskId → tasks.projectId', async () => {
    limit.mockResolvedValueOnce([{ projectId: 'proj-asg' }]);

    const projectId = await resolveProjectId(
      mockRequest({
        url: '/api/assignments',
        body: {
          taskId: '11111111-1111-4111-8111-111111111111',
          resourceId: '22222222-2222-4222-8222-222222222222',
        },
      }),
    );

    expect(projectId).toBe('proj-asg');
    expect(db.select).toHaveBeenCalled();
  });

  it('POST /api/assignments returns undefined for a malformed body (fail-closed)', async () => {
    const projectId = await resolveProjectId(
      mockRequest({
        url: '/api/assignments',
        body: { resourceId: '22222222-2222-4222-8222-222222222222' },
      }),
    );
    expect(projectId).toBeUndefined();
    expect(db.select).not.toHaveBeenCalled();
  });

  it('PATCH/DELETE /api/assignments/:id resolves via assignment → task → project', async () => {
    limit.mockResolvedValueOnce([{ projectId: 'proj-asg-2' }]);

    const projectId = await resolveProjectId(
      mockRequest({
        url: '/api/assignments/:id',
        id: '33333333-3333-4333-8333-333333333333',
      }),
    );

    expect(projectId).toBe('proj-asg-2');
    expect(db.select).toHaveBeenCalled();
  });

  it('GET /api/assignments/:id/timephased uses the same assignment → task join', async () => {
    limit.mockResolvedValueOnce([{ projectId: 'proj-tp' }]);

    const projectId = await resolveProjectId(
      mockRequest({
        url: '/api/assignments/:id/timephased',
        id: '33333333-3333-4333-8333-333333333333',
      }),
    );

    expect(projectId).toBe('proj-tp');
    expect(db.select).toHaveBeenCalled();
  });

  it('DELETE /api/assignments/:id returns undefined when the assignment is missing', async () => {
    limit.mockResolvedValueOnce([]);

    const projectId = await resolveProjectId(
      mockRequest({
        url: '/api/assignments/:id',
        id: '33333333-3333-4333-8333-333333333333',
      }),
    );

    expect(projectId).toBeUndefined();
  });
});

describe('resolveProjectId — calendar exception branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chain.from.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    chain.innerJoin.mockReturnValue(chain);
  });

  it('GET/POST /api/calendars/:id/exceptions resolves via calendar.projectId', async () => {
    limit.mockResolvedValueOnce([{ projectId: 'proj-cal' }]);

    const projectId = await resolveProjectId(
      mockRequest({
        url: '/api/calendars/:id/exceptions',
        id: '44444444-4444-4444-8444-444444444444',
      }),
    );

    expect(projectId).toBe('proj-cal');
    expect(db.select).toHaveBeenCalled();
  });

  it('returns undefined for a global template calendar (fail-closed for the guard)', async () => {
    limit.mockResolvedValueOnce([{ projectId: null }]);

    const projectId = await resolveProjectId(
      mockRequest({
        url: '/api/calendars/:id/exceptions',
        id: '44444444-4444-4444-8444-444444444444',
      }),
    );

    expect(projectId).toBeUndefined();
  });

  it('DELETE /api/calendar-exceptions/:id resolves via exception → calendar → project', async () => {
    limit.mockResolvedValueOnce([{ projectId: 'proj-ex' }]);

    const projectId = await resolveProjectId(
      mockRequest({
        url: '/api/calendar-exceptions/:id',
        id: '55555555-5555-4555-8555-555555555555',
      }),
    );

    expect(projectId).toBe('proj-ex');
    expect(db.select).toHaveBeenCalled();
  });

  it('DELETE /api/calendar-exceptions/:id returns undefined when the exception is missing', async () => {
    limit.mockResolvedValueOnce([]);

    const projectId = await resolveProjectId(
      mockRequest({
        url: '/api/calendar-exceptions/:id',
        id: '55555555-5555-4555-8555-555555555555',
      }),
    );

    expect(projectId).toBeUndefined();
  });
});

describe('resolveProjectId — baseline branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chain.from.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    chain.innerJoin.mockReturnValue(chain);
  });

  it('GET/DELETE /api/baselines/:id resolves via baselines.projectId', async () => {
    limit.mockResolvedValueOnce([{ projectId: 'proj-bl' }]);

    const projectId = await resolveProjectId(
      mockRequest({
        url: '/api/baselines/:id',
        id: '66666666-6666-4666-8666-666666666666',
      }),
    );

    expect(projectId).toBe('proj-bl');
    expect(db.select).toHaveBeenCalled();
  });

  it('returns undefined when the baseline is missing (fail-closed)', async () => {
    limit.mockResolvedValueOnce([]);

    const projectId = await resolveProjectId(
      mockRequest({
        url: '/api/baselines/:id',
        id: '66666666-6666-4666-8666-666666666666',
      }),
    );

    expect(projectId).toBeUndefined();
  });

  it('POST/GET /api/projects/:id/baselines uses the projects prefix (no join)', async () => {
    const projectId = await resolveProjectId(
      mockRequest({
        url: '/api/projects/:id/baselines',
        id: '77777777-7777-4777-8777-777777777777',
      }),
    );

    expect(projectId).toBe('77777777-7777-4777-8777-777777777777');
    expect(db.select).not.toHaveBeenCalled();
  });
});
