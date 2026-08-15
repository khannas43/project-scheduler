import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildTestApp } from './helpers/app.js';
import { bearerAuth, TEST_PROJECT_ID } from './helpers/auth.js';

vi.mock('../src/services/permissionService.js', () => ({
  getEffectivePermissions: vi.fn(),
}));

vi.mock('../src/services/memberService.js', () => ({
  listMembers: vi.fn(),
  addMember: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
}));

vi.mock('../src/services/taskNotifyService.js', () => ({
  notifyMemberTasks: vi.fn(),
}));

const { getEffectivePermissions } = await import('../src/services/permissionService.js');
const { listMembers } = await import('../src/services/memberService.js');

describe('member routes', () => {
  beforeEach(() => {
    vi.mocked(getEffectivePermissions).mockReset();
    vi.mocked(listMembers).mockReset();
  });

  it('GET members returns 403 without project.view', async () => {
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set());
    const app = await buildTestApp();
    const headers = await bearerAuth();

    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${TEST_PROJECT_ID}/members`,
      headers,
    });

    expect(res.statusCode).toBe(403);
    expect(listMembers).not.toHaveBeenCalled();
    await app.close();
  });

  it('GET members lists with project.view', async () => {
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set(['project.view']));
    vi.mocked(listMembers).mockResolvedValue({ members: [], roles: [] });
    const app = await buildTestApp();
    const headers = await bearerAuth();

    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${TEST_PROJECT_ID}/members`,
      headers,
    });

    expect(res.statusCode).toBe(200);
    expect(listMembers).toHaveBeenCalledWith(TEST_PROJECT_ID);
    await app.close();
  });
});
