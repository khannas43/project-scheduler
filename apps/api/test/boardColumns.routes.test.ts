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

vi.mock('../src/services/boardColumnService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/boardColumnService.js')>();
  return {
    ...actual,
    listBoardColumns: vi.fn(),
    createBoardColumn: vi.fn(),
  };
});

vi.mock('../src/services/taskService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/taskService.js')>();
  return {
    ...actual,
    moveTaskBoardColumn: vi.fn(),
  };
});

const { getEffectivePermissions } = await import('../src/services/permissionService.js');
const { listBoardColumns, createBoardColumn } = await import(
  '../src/services/boardColumnService.js'
);
const { moveTaskBoardColumn } = await import('../src/services/taskService.js');
const { buildApp } = await import('../src/app.js');
const { signAccessToken } = await import('../src/lib/jwt.js');

const PROJECT = '00000000-0000-4000-8000-000000000001';
const TASK = '00000000-0000-4000-8000-000000000011';
const USER = '00000000-0000-4000-8000-000000000099';

describe('board-column routes', () => {
  beforeEach(() => {
    vi.mocked(getEffectivePermissions).mockReset();
    vi.mocked(listBoardColumns).mockReset();
    vi.mocked(createBoardColumn).mockReset();
    vi.mocked(moveTaskBoardColumn).mockReset();
    taskProjectLimit.mockReset();
    taskProjectLimit.mockResolvedValue([{ projectId: PROJECT }]);
  });

  it('returns 403 without board.view on GET columns', async () => {
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set(['project.view']));
    const app = await buildApp();
    const token = await signAccessToken(USER, 'u@example.com');

    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${PROJECT}/board-columns`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
    expect(listBoardColumns).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 404 when listBoardColumns raises NotFoundError', async () => {
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set(['board.view']));
    vi.mocked(listBoardColumns).mockRejectedValue(new NotFoundError('Project not found'));
    const app = await buildApp();
    const token = await signAccessToken(USER, 'u@example.com');

    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${PROJECT}/board-columns`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('creates a column with board.manage', async () => {
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set(['board.manage']));
    vi.mocked(createBoardColumn).mockResolvedValue({
      id: 'col-1',
      projectId: PROJECT,
      name: 'To Do',
      sortOrder: 0,
      wipLimit: null,
      isDone: false,
      version: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const app = await buildApp();
    const token = await signAccessToken(USER, 'u@example.com');

    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${PROJECT}/board-columns`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'To Do', sortOrder: 0 },
    });

    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it('returns 403 without board.move_card', async () => {
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set(['task.edit']));
    const app = await buildApp();
    const token = await signAccessToken(USER, 'u@example.com');

    const res = await app.inject({
      method: 'POST',
      url: `/api/tasks/${TASK}/board-column`,
      headers: { authorization: `Bearer ${token}` },
      payload: { boardColumnId: '00000000-0000-4000-8000-000000000022' },
    });

    expect(res.statusCode).toBe(403);
    expect(moveTaskBoardColumn).not.toHaveBeenCalled();
    await app.close();
  });
});
