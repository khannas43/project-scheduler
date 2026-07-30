import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotFoundError } from '../src/middleware/errors.js';

vi.mock('../src/services/permissionService.js', () => ({
  getEffectivePermissions: vi.fn(),
}));

const taskProjectLimit = vi.fn();
vi.mock('../src/db/client.js', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: (...args: unknown[]) => taskProjectLimit(...args),
        })),
      })),
    })),
  },
}));

vi.mock('../src/services/sprintService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/sprintService.js')>();
  return {
    ...actual,
    listSprints: vi.fn(),
    createSprint: vi.fn(),
    updateSprint: vi.fn(),
    deleteSprint: vi.fn(),
    closeSprint: vi.fn(),
    getProjectVelocity: vi.fn(),
    getSprintPointsSummary: vi.fn(),
  };
});

vi.mock('../src/services/taskService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/taskService.js')>();
  return {
    ...actual,
    reorderTaskBacklog: vi.fn(),
  };
});

const { getEffectivePermissions } = await import('../src/services/permissionService.js');
const { listSprints, createSprint, closeSprint, getProjectVelocity, getSprintPointsSummary } =
  await import('../src/services/sprintService.js');
const { reorderTaskBacklog } = await import('../src/services/taskService.js');
const { buildApp } = await import('../src/app.js');
const { signAccessToken } = await import('../src/lib/jwt.js');

const PROJECT = '00000000-0000-4000-8000-000000000001';
const TASK = '00000000-0000-4000-8000-000000000011';
const USER = '00000000-0000-4000-8000-000000000099';

describe('sprint + backlog-rank routes', () => {
  beforeEach(() => {
    vi.mocked(getEffectivePermissions).mockReset();
    vi.mocked(listSprints).mockReset();
    vi.mocked(createSprint).mockReset();
    vi.mocked(closeSprint).mockReset();
    vi.mocked(getProjectVelocity).mockReset();
    vi.mocked(getSprintPointsSummary).mockReset();
    vi.mocked(reorderTaskBacklog).mockReset();
    taskProjectLimit.mockReset();
    taskProjectLimit.mockResolvedValue([{ projectId: PROJECT }]);
  });

  it('returns 403 without sprint.view on GET sprints', async () => {
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set(['project.view']));
    const app = await buildApp();
    const token = await signAccessToken(USER, 'u@example.com');

    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${PROJECT}/sprints`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      code: 'forbidden',
      detail: expect.stringContaining('sprint.view'),
    });
    expect(listSprints).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 404 when listSprints raises NotFoundError', async () => {
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set(['sprint.view']));
    vi.mocked(listSprints).mockRejectedValue(new NotFoundError('Project not found'));
    const app = await buildApp();
    const token = await signAccessToken(USER, 'u@example.com');

    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${PROJECT}/sprints`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('creates a sprint with sprint.create', async () => {
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set(['sprint.create']));
    vi.mocked(createSprint).mockResolvedValue({
      id: 'sprint-1',
      projectId: PROJECT,
      name: 'Sprint 1',
      goal: null,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-01-15T00:00:00.000Z'),
      capacity: '20',
      state: 'planned',
      version: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const app = await buildApp();
    const token = await signAccessToken(USER, 'u@example.com');

    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${PROJECT}/sprints`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Sprint 1',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-01-15T00:00:00.000Z',
        capacity: 20,
      },
    });

    expect(res.statusCode).toBe(201);
    expect(createSprint).toHaveBeenCalled();
    await app.close();
  });

  it('closes a sprint with sprint.edit via POST /close', async () => {
    const SPRINT = '00000000-0000-4000-8000-000000000021';
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set(['sprint.edit']));
    vi.mocked(closeSprint).mockResolvedValue({
      sprint: {
        id: SPRINT,
        projectId: PROJECT,
        name: 'Sprint 1',
        goal: null,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-01-15T00:00:00.000Z'),
        capacity: '20',
        state: 'closed',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      carriedOverTaskIds: ['task-a'],
    });
    const app = await buildApp();
    const token = await signAccessToken(USER, 'u@example.com');

    const res = await app.inject({
      method: 'POST',
      url: `/api/sprints/${SPRINT}/close`,
      headers: { authorization: `Bearer ${token}` },
      payload: { carryOverToSprintId: null },
    });

    expect(res.statusCode).toBe(200);
    expect(closeSprint).toHaveBeenCalledWith(SPRINT, null, USER);
    expect(res.json()).toMatchObject({ carriedOverTaskIds: ['task-a'] });
    await app.close();
  });

  it('returns velocity with sprint.view', async () => {
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set(['sprint.view']));
    vi.mocked(getProjectVelocity).mockResolvedValue([]);
    const app = await buildApp();
    const token = await signAccessToken(USER, 'u@example.com');

    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${PROJECT}/velocity`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    expect(getProjectVelocity).toHaveBeenCalledWith(PROJECT);
    await app.close();
  });

  it('returns points-summary with sprint.view', async () => {
    const SPRINT = '00000000-0000-4000-8000-000000000021';
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set(['sprint.view']));
    vi.mocked(getSprintPointsSummary).mockResolvedValue({
      sprintId: SPRINT,
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-14T00:00:00.000Z',
      totalPoints: 10,
      completedPoints: 4,
      remainingPoints: 6,
    });
    const app = await buildApp();
    const token = await signAccessToken(USER, 'u@example.com');

    const res = await app.inject({
      method: 'GET',
      url: `/api/sprints/${SPRINT}/points-summary`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ totalPoints: 10, remainingPoints: 6 });
    expect(getSprintPointsSummary).toHaveBeenCalledWith(SPRINT);
    await app.close();
  });

  it('returns 403 without backlog.reorder', async () => {
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set(['task.edit']));
    const app = await buildApp();
    const token = await signAccessToken(USER, 'u@example.com');

    const res = await app.inject({
      method: 'POST',
      url: `/api/tasks/${TASK}/backlog-rank`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(res.statusCode).toBe(403);
    expect(reorderTaskBacklog).not.toHaveBeenCalled();
    await app.close();
  });
});
