import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { ProjectCreateInputSchema } from '@pkg/schema';
import { z } from 'zod';

import { AUTH_ONLY_ROUTE_CONFIG } from '../lib/routeMeta.js';
import { BadRequestError } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import {
  buildImportTemplateCsv,
  buildImportTemplateExcel,
  createProjectFromSpreadsheet,
  importSpreadsheetIntoProject,
} from '../services/spreadsheetImportService.js';
import { requirePermission } from '../middleware/permissions.js';

/**
 * Body for POST /api/projects/from-spreadsheet.
 * File is base64 so we stay on JSON (same pattern as avoiding multipart for MSPDI XML).
 */
const FromSpreadsheetBodySchema = ProjectCreateInputSchema.omit({ ownerId: true, calendarId: true })
  .partial({ isArchived: true })
  .extend({
    filename: z.string().min(1).max(255),
    contentBase64: z.string().min(1),
  });

/** Template download + create-project-from-CSV/Excel. */
export const spreadsheetImportRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/api/projects/import-template.csv',
    {
      preHandler: [requireAuth],
    },
    async (_request, reply) => {
      const csv = buildImportTemplateCsv();
      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="project-import-template.csv"');
      return csv;
    },
  );

  fastify.get(
    '/api/projects/import-template.xlsx',
    {
      preHandler: [requireAuth],
    },
    async (_request, reply) => {
      const buffer = await buildImportTemplateExcel();
      return reply
        .header(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        .header('Content-Disposition', 'attachment; filename="project-import-template.xlsx"')
        .send(buffer);
    },
  );

  fastify.post(
    '/api/projects/from-spreadsheet',
    {
      config: AUTH_ONLY_ROUTE_CONFIG,
      preHandler: [requireAuth],
      schema: { body: FromSpreadsheetBodySchema },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');

      let content: Buffer;
      try {
        content = Buffer.from(request.body.contentBase64, 'base64');
      } catch {
        throw new BadRequestError('Invalid contentBase64');
      }
      if (content.length === 0) {
        throw new BadRequestError('Uploaded file is empty');
      }
      // ~5MB decoded
      if (content.length > 5 * 1024 * 1024) {
        throw new BadRequestError('File too large (max 5 MB)');
      }

      const { project, taskCount, dependencyCount } = await createProjectFromSpreadsheet(
        {
          name: request.body.name,
          description: request.body.description,
          status: request.body.status,
          startDate: request.body.startDate,
          isArchived: request.body.isArchived,
        },
        request.body.filename,
        content,
        user.id,
      );

      reply.code(201);
      return { ...project, taskCount, dependencyCount };
    },
  );

  fastify.post(
    '/api/projects/:id/import/spreadsheet',
    {
      preHandler: [requireAuth, requirePermission('data.import')],
      schema: {
        params: z.object({ id: z.uuid() }),
        body: z.object({
          filename: z.string().min(1).max(255),
          contentBase64: z.string().min(1),
          mode: z.enum(['replace', 'merge']),
        }),
      },
    },
    async (request) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');

      let content: Buffer;
      try {
        content = Buffer.from(request.body.contentBase64, 'base64');
      } catch {
        throw new BadRequestError('Invalid contentBase64');
      }
      if (content.length === 0) {
        throw new BadRequestError('Uploaded file is empty');
      }
      if (content.length > 5 * 1024 * 1024) {
        throw new BadRequestError('File too large (max 5 MB)');
      }

      return importSpreadsheetIntoProject(
        request.params.id,
        request.body.filename,
        content,
        request.body.mode,
        user.id,
      );
    },
  );
};
