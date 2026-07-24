import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { DependencyCreateInputSchema } from '@pkg/schema';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import * as dependencyService from '../services/dependencyService.js';

const DependencyIdParams = z.object({ id: z.uuid() });

/** §5.2 dependency routes — HTTP only; business logic in dependencyService. */
export const dependencyRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    '/api/dependencies',
    {
      preHandler: [requireAuth, requirePermission('dependency.create')],
      schema: { body: DependencyCreateInputSchema },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      const result = await dependencyService.createDependency(request.body, user.id);
      reply.code(201);
      return result;
    },
  );

  fastify.delete(
    '/api/dependencies/:id',
    {
      preHandler: [requireAuth, requirePermission('dependency.delete')],
      schema: { params: DependencyIdParams },
    },
    async (request) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      return dependencyService.deleteDependency(request.params.id, user.id);
    },
  );
};
