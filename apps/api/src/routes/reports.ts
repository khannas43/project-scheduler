import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import {
  getCostOverviewReport,
  getCriticalTasksReport,
  getMilestoneReport,
  getOverallocatedResourcesReport,
  getProjectSummary,
  getSlippingTasksReport,
} from '../services/builtinReportsService.js';
import { buildCsv } from '../services/csvExportService.js';
import { buildExcelBuffer } from '../services/excelExportService.js';
import { buildPdfBuffer } from '../services/pdfExportService.js';
import { loadTaskReport, slugExportFilename } from '../services/reportDataService.js';
import { writeAuditLog } from '../services/scheduleRunner.js';
import { db } from '../db/client.js';

const ProjectIdParams = z.object({ id: z.uuid() });
const SlippingTasksQuery = z.object({ baselineId: z.uuid().optional() });

/**
 * Phase 5 exports (data.export) + built-in JSON reports (report.view).
 */
export const reportRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/api/projects/:id/reports/summary',
    {
      preHandler: [requireAuth, requirePermission('report.view')],
      schema: { params: ProjectIdParams },
    },
    async (request) => getProjectSummary(request.params.id),
  );

  fastify.get(
    '/api/projects/:id/reports/critical-tasks',
    {
      preHandler: [requireAuth, requirePermission('report.view')],
      schema: { params: ProjectIdParams },
    },
    async (request) => getCriticalTasksReport(request.params.id),
  );

  fastify.get(
    '/api/projects/:id/reports/milestones',
    {
      preHandler: [requireAuth, requirePermission('report.view')],
      schema: { params: ProjectIdParams },
    },
    async (request) => getMilestoneReport(request.params.id),
  );

  fastify.get(
    '/api/projects/:id/reports/overallocated-resources',
    {
      preHandler: [requireAuth, requirePermission('report.view')],
      schema: { params: ProjectIdParams },
    },
    async (request) => getOverallocatedResourcesReport(request.params.id),
  );

  fastify.get(
    '/api/projects/:id/reports/cost-overview',
    {
      preHandler: [requireAuth, requirePermission('report.view')],
      schema: { params: ProjectIdParams },
    },
    async (request) => getCostOverviewReport(request.params.id),
  );

  fastify.get(
    '/api/projects/:id/reports/slipping-tasks',
    {
      preHandler: [requireAuth, requirePermission('report.view')],
      schema: { params: ProjectIdParams, querystring: SlippingTasksQuery },
    },
    async (request) =>
      getSlippingTasksReport(request.params.id, request.query.baselineId),
  );

  fastify.get(
    '/api/projects/:id/export/csv',
    {
      preHandler: [requireAuth, requirePermission('data.export')],
      schema: { params: ProjectIdParams },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      const { projectName, rows } = await loadTaskReport(request.params.id);
      const csv = buildCsv(rows);
      const filename = slugExportFilename(projectName, 'csv');
      await writeAuditLog(db, {
        userId: user.id,
        projectId: request.params.id,
        action: 'project.export_csv',
        entityType: 'project',
        entityId: request.params.id,
        after: { format: 'csv', rowCount: rows.length },
      });
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
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      const { projectName, rows } = await loadTaskReport(request.params.id);
      const buffer = await buildExcelBuffer(projectName, rows);
      const filename = slugExportFilename(projectName, 'xlsx');
      await writeAuditLog(db, {
        userId: user.id,
        projectId: request.params.id,
        action: 'project.export_excel',
        entityType: 'project',
        entityId: request.params.id,
        after: { format: 'xlsx', rowCount: rows.length },
      });
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
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      const { projectName, rows } = await loadTaskReport(request.params.id);
      const buffer = await buildPdfBuffer(projectName, rows);
      const filename = slugExportFilename(projectName, 'pdf');
      await writeAuditLog(db, {
        userId: user.id,
        projectId: request.params.id,
        action: 'project.export_pdf',
        entityType: 'project',
        entityId: request.params.id,
        after: { format: 'pdf', rowCount: rows.length },
      });
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(buffer);
    },
  );
};
