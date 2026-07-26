import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { exportProjectMspdi } from '../services/mspdiExportService.js';
import { importProjectMspdi } from '../services/mspdiImportService.js';

const ProjectIdParams = z.object({ id: z.uuid() });

/**
 * §5.2 MSPDI XML export/import.
 * Import accepts raw application/xml (or text/xml) — not multipart, not JSON.
 */
export const mspdiRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addContentTypeParser(
    ['application/xml', 'text/xml'],
    { parseAs: 'string' },
    (_request, body, done) => {
      done(null, body);
    },
  );

  fastify.get(
    '/api/projects/:id/export/xml',
    {
      preHandler: [requireAuth, requirePermission('data.export')],
      schema: { params: ProjectIdParams },
    },
    async (request, reply) => {
      const { xml, filename } = await exportProjectMspdi(request.params.id);
      reply
        .header('Content-Type', 'application/xml; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`);
      return xml;
    },
  );

  fastify.post(
    '/api/projects/:id/import/xml',
    {
      preHandler: [requireAuth, requirePermission('data.import')],
      schema: { params: ProjectIdParams },
    },
    async (request) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      const xml = typeof request.body === 'string' ? request.body : '';
      return importProjectMspdi(request.params.id, xml, user.id);
    },
  );
};
