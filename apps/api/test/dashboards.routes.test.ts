import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotFoundError } from '../src/middleware/errors.js';

vi.mock('../src/services/permissionService.js', () => ({
  getEffectivePermissions: vi.fn(),
}));

vi.mock('../src/services/dashboardService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/dashboardService.js')>();
  return {
    ...actual,
    getProjectDashboard: vi.fn(),
    getPortfolioDashboard: vi.fn(),
  };
});

const { getEffectivePermissions } = await import('../src/services/permissionService.js');
const { getProjectDashboard, getPortfolioDashboard } = await import(
  '../src/services/dashboardService.js'
);
const { buildApp } = await import('../src/app.js');
const { signAccessToken } = await import('../src/lib/jwt.js');

const PROJECT = '00000000-0000-4000-8000-000000000001';
const USER = '00000000-0000-4000-8000-000000000099';

describe('dashboard routes', () => {
  beforeEach(() => {
    vi.mocked(getEffectivePermissions).mockReset();
    vi.mocked(getProjectDashboard).mockReset();
    vi.mocked(getPortfolioDashboard).mockReset();
  });

  it('returns 403 without report.view on project dashboard', async () => {
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set(['project.view']));
    const app = await buildApp();
    const token = await signAccessToken(USER, 'u@example.com');

    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${PROJECT}/dashboard`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      code: 'forbidden',
      detail: expect.stringContaining('report.view'),
    });
    expect(getProjectDashboard).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 404 for an unknown project', async () => {
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set(['report.view']));
    vi.mocked(getProjectDashboard).mockRejectedValue(new NotFoundError('Project not found'));
    const app = await buildApp();
    const token = await signAccessToken(USER, 'u@example.com');

    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${PROJECT}/dashboard`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'not_found', detail: 'Project not found' });
    await app.close();
  });

  it('returns 401 for portfolio dashboard without a bearer token', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/dashboard/portfolio',
    });

    expect(res.statusCode).toBe(401);
    expect(getPortfolioDashboard).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 200 for portfolio dashboard with a bearer token', async () => {
    vi.mocked(getPortfolioDashboard).mockResolvedValue([
      {
        projectId: PROJECT,
        projectName: 'Bridge',
        status: 'active',
        health: 'on_track',
        overallPercentComplete: 40,
        baselineId: null,
        spi: null,
        cpi: null,
        criticalTaskCount: 2,
        overallocatedResourceCount: 0,
      },
    ]);
    const app = await buildApp();
    const token = await signAccessToken(USER, 'u@example.com');

    const res = await app.inject({
      method: 'GET',
      url: '/api/dashboard/portfolio',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      expect.objectContaining({ projectId: PROJECT, projectName: 'Bridge', health: 'on_track' }),
    ]);
    expect(getPortfolioDashboard).toHaveBeenCalledWith(USER);
    await app.close();
  });
});
