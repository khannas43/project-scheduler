import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildTestApp } from './helpers/app.js';
import { bearerAuth, TEST_PROJECT_ID, TEST_USER_ID } from './helpers/auth.js';

vi.mock('../src/services/permissionService.js', () => ({
  getEffectivePermissions: vi.fn(),
}));

vi.mock('../src/services/savedReportService.js', () => ({
  listSavedReports: vi.fn(),
  runCustomReport: vi.fn(),
  createSavedReport: vi.fn(),
  getSavedReport: vi.fn(),
  updateSavedReport: vi.fn(),
  deleteSavedReport: vi.fn(),
  exportSavedReport: vi.fn(),
}));

vi.mock('../src/services/reportDataService.js', () => ({
  slugExportFilename: vi.fn(() => 'report'),
}));

const { getEffectivePermissions } = await import('../src/services/permissionService.js');
const { listSavedReports, createSavedReport } = await import('../src/services/savedReportService.js');

const minimalDefinition = {
  columns: ['wbsCode', 'name'],
};

describe('saved report routes', () => {
  beforeEach(() => {
    vi.mocked(getEffectivePermissions).mockReset();
    vi.mocked(listSavedReports).mockReset();
    vi.mocked(createSavedReport).mockReset();
  });

  it('GET saved-reports returns 403 without report.view', async () => {
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set(['project.view']));
    const app = await buildTestApp();
    const headers = await bearerAuth();

    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${TEST_PROJECT_ID}/saved-reports`,
      headers,
    });

    expect(res.statusCode).toBe(403);
    expect(listSavedReports).not.toHaveBeenCalled();
    await app.close();
  });

  it('GET saved-reports lists with report.view', async () => {
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set(['report.view']));
    vi.mocked(listSavedReports).mockResolvedValue([]);
    const app = await buildTestApp();
    const headers = await bearerAuth();

    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${TEST_PROJECT_ID}/saved-reports`,
      headers,
    });

    expect(res.statusCode).toBe(200);
    expect(listSavedReports).toHaveBeenCalledWith(TEST_PROJECT_ID);
    await app.close();
  });

  it('POST saved-reports creates with report.create', async () => {
    vi.mocked(getEffectivePermissions).mockResolvedValue(new Set(['report.create']));
    vi.mocked(createSavedReport).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000020',
      name: 'Custom',
    } as never);
    const app = await buildTestApp();
    const headers = await bearerAuth();

    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${TEST_PROJECT_ID}/saved-reports`,
      headers,
      payload: { name: 'Custom', definition: minimalDefinition },
    });

    expect(res.statusCode).toBe(201);
    expect(createSavedReport).toHaveBeenCalledWith(
      TEST_PROJECT_ID,
      expect.objectContaining({ name: 'Custom' }),
      TEST_USER_ID,
    );
    await app.close();
  });
});
