import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildTestApp } from './helpers/app.js';
import { bearerAuth, TEST_PROJECT_ID, TEST_USER_ID } from './helpers/auth.js';

vi.mock('../src/services/permissionService.js', () => ({
  getEffectivePermissions: vi.fn(),
}));

vi.mock('../src/services/projectService.js', () => ({
  listProjectsForUser: vi.fn(),
  createProject: vi.fn(),
  getProject: vi.fn(),
  updateProject: vi.fn(),
  archiveProject: vi.fn(),
  restoreProject: vi.fn(),
}));

vi.mock('../src/services/projectDuplicateService.js', () => ({
  duplicateProject: vi.fn(),
}));

const { getEffectivePermissions } = await import('../src/services/permissionService.js');
const { listProjectsForUser, createProject, getProject } = await import(
  '../src/services/projectService.js'
);

describe('project routes', () => {
  beforeEach(() => {
    vi.mocked(getEffectivePermissions).mockReset();
    vi.mocked(listProjectsForUser).mockReset();
    vi.mocked(createProject).mockReset();
    vi.mocked(getProject).mockReset();
  });

  it('GET /api/projects returns 401 without auth', async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/projects' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('GET /api/projects lists membership projects', async () => {
    vi.mocked(listProjectsForUser).mockResolvedValue([
      {
        id: TEST_PROJECT_ID,
        name: 'Aurora',
        description: null,
        status: 'active',
        startDate: null,
        finishDate: null,
        statusDate: null,
        calendarId: '00000000-0000-4000-8000-000000000010',
        ownerId: TEST_USER_ID,
        isArchived: false,
        category: null,
        templateKey: null,
        settings: {},
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never);
    const app = await buildTestApp();
    const headers = await bearerAuth();

    const res = await app.inject({ method: 'GET', url: '/api/projects', headers });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: TEST_PROJECT_ID, name: 'Aurora' })]),
    );
    expect(listProjectsForUser).toHaveBeenCalledWith(TEST_USER_ID);
    await app.close();
  });

  it('POST /api/projects creates with 201', async () => {
    vi.mocked(createProject).mockResolvedValue({
      id: TEST_PROJECT_ID,
      name: 'New Project',
      description: null,
      status: 'active',
      startDate: null,
      finishDate: null,
      statusDate: null,
      calendarId: '00000000-0000-4000-8000-000000000010',
      ownerId: TEST_USER_ID,
      isArchived: false,
      category: null,
      templateKey: null,
      settings: {},
      version: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    const app = await buildTestApp();
    const headers = await bearerAuth();

    const res = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers,
      payload: { name: 'New Project', status: 'active' },
    });

    expect(res.statusCode).toBe(201);
    expect(createProject).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Project', status: 'active' }),
      TEST_USER_ID,
    );
    await app.close();
  });

  it('GET /api/projects/:id returns 403 without project.view', async () => {
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set());
    const app = await buildTestApp();
    const headers = await bearerAuth();

    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${TEST_PROJECT_ID}`,
      headers,
    });

    expect(res.statusCode).toBe(403);
    expect(getProject).not.toHaveBeenCalled();
    await app.close();
  });

  it('GET /api/projects/:id returns project with project.view', async () => {
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set(['project.view']));
    vi.mocked(getProject).mockResolvedValue({
      id: TEST_PROJECT_ID,
      name: 'Aurora',
    } as never);
    const app = await buildTestApp();
    const headers = await bearerAuth();

    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${TEST_PROJECT_ID}`,
      headers,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: TEST_PROJECT_ID, name: 'Aurora' });
    await app.close();
  });
});
