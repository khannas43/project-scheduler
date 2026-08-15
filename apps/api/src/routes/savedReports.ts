import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import {
  SavedReportCreateBodySchema,
  SavedReportPreviewBodySchema,
  SavedReportUpdateBodySchema,
} from '@pkg/schema';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { slugExportFilename } from '../services/reportDataService.js';
import * as savedReportService from '../services/savedReportService.js';

const ProjectIdParams = z.object({ id: z.uuid() });
const SavedReportParams = z.object({ id: z.uuid(), reportId: z.uuid() });

/**
 * Custom / saved report builder — uses report.view / report.create / report.export.
 */
export const savedReportRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/api/projects/:id/saved-reports',
    {
      preHandler: [requireAuth, requirePermission('report.view')],
      schema: { params: ProjectIdParams },
    },
    async (request) => savedReportService.listSavedReports(request.params.id),
  );

  /** Preview an unsaved definition — registered before :reportId routes. */
  fastify.post(
    '/api/projects/:id/saved-reports/preview',
    {
      preHandler: [requireAuth, requirePermission('report.view')],
      schema: {
        params: ProjectIdParams,
        body: SavedReportPreviewBodySchema,
      },
    },
    async (request) =>
      savedReportService.runCustomReport(request.params.id, request.body.definition),
  );

  fastify.post(
    '/api/projects/:id/saved-reports',
    {
      preHandler: [requireAuth, requirePermission('report.create')],
      schema: {
        params: ProjectIdParams,
        body: SavedReportCreateBodySchema,
      },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      const created = await savedReportService.createSavedReport(
        request.params.id,
        request.body,
        user.id,
      );
      reply.code(201);
      return created;
    },
  );

  fastify.get(
    '/api/projects/:id/saved-reports/:reportId',
    {
      preHandler: [requireAuth, requirePermission('report.view')],
      schema: { params: SavedReportParams },
    },
    async (request) =>
      savedReportService.getSavedReport(request.params.id, request.params.reportId),
  );

  fastify.patch(
    '/api/projects/:id/saved-reports/:reportId',
    {
      preHandler: [requireAuth, requirePermission('report.create')],
      schema: {
        params: SavedReportParams,
        body: SavedReportUpdateBodySchema,
      },
    },
    async (request) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      return savedReportService.updateSavedReport(
        request.params.id,
        request.params.reportId,
        request.body,
        user.id,
      );
    },
  );

  fastify.delete(
    '/api/projects/:id/saved-reports/:reportId',
    {
      preHandler: [requireAuth, requirePermission('report.create')],
      schema: { params: SavedReportParams },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      await savedReportService.deleteSavedReport(
        request.params.id,
        request.params.reportId,
        user.id,
      );
      reply.code(204);
    },
  );

  fastify.get(
    '/api/projects/:id/saved-reports/:reportId/run',
    {
      preHandler: [requireAuth, requirePermission('report.view')],
      schema: { params: SavedReportParams },
    },
    async (request) =>
      savedReportService.runSavedReport(request.params.id, request.params.reportId),
  );

  fastify.get(
    '/api/projects/:id/saved-reports/:reportId/export/csv',
    {
      preHandler: [requireAuth, requirePermission('report.export')],
      schema: { params: SavedReportParams },
    },
    async (request, reply) => {
      const result = await savedReportService.runSavedReport(
        request.params.id,
        request.params.reportId,
      );
      const csv = savedReportService.buildCustomReportCsv(result);
      const filename = slugExportFilename(`${result.projectName}-${result.reportName}`, 'csv');
      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`);
      return csv;
    },
  );
};
