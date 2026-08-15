import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildTestApp } from './helpers/app.js';
import { bearerAuth, TEST_PROJECT_ID, TEST_USER_ID } from './helpers/auth.js';

vi.mock('../src/services/permissionService.js', () => ({
  getEffectivePermissions: vi.fn(),
}));

vi.mock('../src/services/taskService.js', () => ({
  listProjectTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  moveTask: vi.fn(),
  setTaskBoardColumn: vi.fn(),
  reorderTaskBacklog: vi.fn(),
}));

const { getEffectivePermissions } = await import('../src/services/permissionService.js');
const { listProjectTasks, createTask } = await import('../src/services/taskService.js');

describe('task routes', () => {
  beforeEach(() => {
    vi.mocked(getEffectivePermissions).mockReset();
    vi.mocked(listProjectTasks).mockReset();
    vi.mocked(createTask).mockReset();
  });

  it('GET tasks returns 403 without task.view', async () => {
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set(['project.view']));
    const app = await buildTestApp();
    const headers = await bearerAuth();

    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${TEST_PROJECT_ID}/tasks`,
      headers,
    });

    expect(res.statusCode).toBe(403);
    expect(listProjectTasks).not.toHaveBeenCalled();
    await app.close();
  });

  it('GET tasks lists with task.view', async () => {
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set(['task.view']));
    const emptyPayload = { tasks: [], dependencies: [], calendars: [], assignments: [], projectVersion: 1 };
    vi.mocked(listProjectTasks).mockResolvedValue(emptyPayload);
    const app = await buildTestApp();
    const headers = await bearerAuth();

    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${TEST_PROJECT_ID}/tasks`,
      headers,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(emptyPayload);
    expect(listProjectTasks).toHaveBeenCalledWith(TEST_PROJECT_ID);
    await app.close();
  });

  it('POST tasks creates with task.create', async () => {
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set(['task.create']));
    vi.mocked(createTask).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000011',
      projectId: TEST_PROJECT_ID,
      name: 'Foundation',
    } as never);
    const app = await buildTestApp();
    const headers = await bearerAuth();

    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${TEST_PROJECT_ID}/tasks`,
      headers,
      payload: {
        name: 'Foundation',
        durationMinutes: 480,
      },
    });

    expect(res.statusCode).toBe(201);
    expect(createTask).toHaveBeenCalledWith(
      TEST_PROJECT_ID,
      expect.objectContaining({ name: 'Foundation' }),
      TEST_USER_ID,
    );
    await app.close();
  });
});
