import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { buildCsv } from '../services/csvExportService.js';
import { buildExcelBuffer } from '../services/excelExportService.js';
import { buildPdfBuffer } from '../services/pdfExportService.js';
import { loadTaskReport, slugExportFilename } from '../services/reportDataService.js';

const ProjectIdParams = z.object({ id: z.uuid() });

/**
 * Phase 5 task-list exports — CSV / Excel / PDF.
 * All three share loadTaskReport (one DB loader) + a pure renderer.
 */
export const reportRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/api/projects/:id/export/csv',
    {
      preHandler: [requireAuth, requirePermission('data.export')],
      schema: { params: ProjectIdParams },
    },
    async (request, reply) => {
      const { projectName, rows } = await loadTaskReport(request.params.id);
      const csv = buildCsv(rows);
      const filename = slugExportFilename(projectName, 'csv');
      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`);
      return csv;
    },
  );

  fastify.get(
    '/api/projects/:id/export/excel',
    {
      preHandler: [requireAuth, requirePermission('data.export')],
      schema: { params: ProjectIdParams },
    },
    async (request, reply) => {
      const { projectName, rows } = await loadTaskReport(request.params.id);
      const buffer = await buildExcelBuffer(projectName, rows);
      const filename = slugExportFilename(projectName, 'xlsx');
      return reply
        .header(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(buffer);
    },
  );

  fastify.get(
    '/api/projects/:id/export/pdf',
    {
      preHandler: [requireAuth, requirePermission('data.export')],
      schema: { params: ProjectIdParams },
    },
    async (request, reply) => {
      const { projectName, rows } = await loadTaskReport(request.params.id);
      const buffer = await buildPdfBuffer(projectName, rows);
      const filename = slugExportFilename(projectName, 'pdf');
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(buffer);
    },
  );
};
