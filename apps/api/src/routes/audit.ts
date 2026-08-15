import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import * as auditLogService from '../services/auditLogService.js';

const ProjectIdParams = z.object({ id: z.uuid() });

const AuditLogQuerySchema = z.object({
  action: z.string().min(1).max(120).optional(),
  entityType: z.string().min(1).max(80).optional(),
  userId: z.uuid().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

/** Project activity / audit log (§5.12 collaboration trail). */
export const auditRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/api/projects/:id/audit-log',
    {
      preHandler: [requireAuth, requirePermission('audit.view')],
      schema: {
        params: ProjectIdParams,
        querystring: AuditLogQuerySchema,
      },
    },
    async (request) => {
      const q = request.query;
      return auditLogService.listProjectAuditLog(request.params.id, {
        ...(q.action !== undefined ? { action: q.action } : {}),
        ...(q.entityType !== undefined ? { entityType: q.entityType } : {}),
        ...(q.userId !== undefined ? { userId: q.userId } : {}),
        ...(q.from !== undefined ? { from: new Date(q.from) } : {}),
        ...(q.to !== undefined ? { to: new Date(q.to) } : {}),
        ...(q.limit !== undefined ? { limit: q.limit } : {}),
        ...(q.offset !== undefined ? { offset: q.offset } : {}),
      });
    },
  );
};
