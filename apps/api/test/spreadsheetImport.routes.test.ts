import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BadRequestError } from '../src/middleware/errors.js';
import { buildTestApp } from './helpers/app.js';
import { bearerAuth, TEST_USER_ID } from './helpers/auth.js';

vi.mock('../src/services/spreadsheetImportService.js', () => ({
  buildImportTemplateCsv: vi.fn(() => 'WBS,Name\n1,Task'),
  buildImportTemplateExcel: vi.fn(async () => Buffer.from('xlsx')),
  createProjectFromSpreadsheet: vi.fn(),
  importSpreadsheetIntoProject: vi.fn(),
}));

const { createProjectFromSpreadsheet } = await import('../src/services/spreadsheetImportService.js');

describe('spreadsheet import routes', () => {
  beforeEach(() => {
    vi.mocked(createProjectFromSpreadsheet).mockReset();
  });

  it('GET import-template.csv requires auth', async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/projects/import-template.csv' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('GET import-template.csv returns CSV when authenticated', async () => {
    const app = await buildTestApp();
    const headers = await bearerAuth();

    const res = await app.inject({
      method: 'GET',
      url: '/api/projects/import-template.csv',
      headers,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.body).toContain('WBS');
    await app.close();
  });

  it('POST from-spreadsheet rejects empty decoded content', async () => {
    const app = await buildTestApp();
    const headers = await bearerAuth();

    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/from-spreadsheet',
      headers,
      payload: {
        name: 'Imported',
        status: 'active',
        filename: 'empty.csv',
        contentBase64: Buffer.from('').toString('base64'),
      },
    });

    expect(res.statusCode).toBe(400);
    expect(createProjectFromSpreadsheet).not.toHaveBeenCalled();
    await app.close();
  });

  it('POST from-spreadsheet creates project on success', async () => {
    vi.mocked(createProjectFromSpreadsheet).mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Imported',
    } as never);
    const app = await buildTestApp();
    const headers = await bearerAuth();
    const csv = 'WBS,Name,Duration\n1,Task,1';

    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/from-spreadsheet',
      headers,
      payload: {
        name: 'Imported',
        status: 'active',
        filename: 'plan.csv',
        contentBase64: Buffer.from(csv).toString('base64'),
      },
    });

    expect(res.statusCode).toBe(201);
    expect(createProjectFromSpreadsheet).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Imported', status: 'active' }),
      'plan.csv',
      expect.any(Buffer),
      TEST_USER_ID,
    );
    await app.close();
  });

  it('POST from-spreadsheet maps BadRequestError', async () => {
    vi.mocked(createProjectFromSpreadsheet).mockRejectedValue(
      new BadRequestError('Missing Name column'),
    );
    const app = await buildTestApp();
    const headers = await bearerAuth();

    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/from-spreadsheet',
      headers,
      payload: {
        name: 'Imported',
        status: 'active',
        filename: 'bad.csv',
        contentBase64: Buffer.from('x').toString('base64'),
      },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
