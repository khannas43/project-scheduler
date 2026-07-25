import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import * as baselineService from '../services/baselineService.js';

const ProjectIdParams = z.object({ id: z.uuid() });
const BaselineIdParams = z.object({ id: z.uuid() });

const BaselineCreateBodySchema = z.object({
  name: z.string().min(1).nullable().optional(),
});

/** §5.2 baseline routes — project-scoped list/save + baseline-scoped detail/clear. */
export const baselineRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    '/api/projects/:id/baselines',
    {
      preHandler: [requireAuth, requirePermission('baseline.save')],
      schema: {
        params: ProjectIdParams,
        body: BaselineCreateBodySchema,
      },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      const created = await baselineService.createBaseline(
        request.params.id,
        request.body.name,
        user.id,
      );
      reply.code(201);
      return created;
    },
  );

  fastify.get(
    '/api/projects/:id/baselines',
    {
      preHandler: [requireAuth, requirePermission('baseline.view')],
      schema: { params: ProjectIdParams },
    },
    async (request) => baselineService.listBaselines(request.params.id),
  );

  fastify.get(
    '/api/baselines/:id',
    {
      preHandler: [requireAuth, requirePermission('baseline.view')],
      schema: { params: BaselineIdParams },
    },
    async (request) => baselineService.getBaselineDetail(request.params.id),
  );

  fastify.delete(
    '/api/baselines/:id',
    {
      preHandler: [requireAuth, requirePermission('baseline.clear')],
      schema: { params: BaselineIdParams },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      await baselineService.clearBaseline(request.params.id, user.id);
      reply.code(204);
      return null;
    },
  );
};
