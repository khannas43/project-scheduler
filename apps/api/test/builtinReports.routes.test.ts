import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotFoundError } from '../src/middleware/errors.js';

vi.mock('../src/services/permissionService.js', () => ({
  getEffectivePermissions: vi.fn(),
}));

vi.mock('../src/services/builtinReportsService.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/services/builtinReportsService.js')>();
  return {
    ...actual,
    getProjectSummary: vi.fn(),
    getSlippingTasksReport: vi.fn(),
  };
});

const { getEffectivePermissions } = await import('../src/services/permissionService.js');
const { getProjectSummary, getSlippingTasksReport } = await import(
  '../src/services/builtinReportsService.js'
);
const { buildApp } = await import('../src/app.js');
const { signAccessToken } = await import('../src/lib/jwt.js');

const PROJECT = '00000000-0000-4000-8000-000000000001';
const OTHER_BASELINE = '11111111-1111-4111-8111-111111111111';
const USER = '00000000-0000-4000-8000-000000000099';

describe('built-in report routes', () => {
  beforeEach(() => {
    vi.mocked(getEffectivePermissions).mockReset();
    vi.mocked(getProjectSummary).mockReset();
    vi.mocked(getSlippingTasksReport).mockReset();
  });

  it('returns 403 without report.view', async () => {
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set(['project.view']));
    const app = await buildApp();
    const token = await signAccessToken(USER, 'u@example.com');

    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${PROJECT}/reports/summary`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      code: 'forbidden',
      detail: expect.stringContaining('report.view'),
    });
    expect(getProjectSummary).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 404 for an unknown project', async () => {
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set(['report.view']));
    vi.mocked(getProjectSummary).mockRejectedValue(new NotFoundError('Project not found'));
    const app = await buildApp();
    const token = await signAccessToken(USER, 'u@example.com');

    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${PROJECT}/reports/summary`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'not_found', detail: 'Project not found' });
    await app.close();
  });

  it('returns 404 when slipping-tasks baselineId belongs to another project', async () => {
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set(['report.view']));
    vi.mocked(getSlippingTasksReport).mockRejectedValue(new NotFoundError('Baseline not found'));
    const app = await buildApp();
    const token = await signAccessToken(USER, 'u@example.com');

    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${PROJECT}/reports/slipping-tasks?baselineId=${OTHER_BASELINE}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'not_found', detail: 'Baseline not found' });
    expect(getSlippingTasksReport).toHaveBeenCalledWith(PROJECT, OTHER_BASELINE);
    await app.close();
  });
});
