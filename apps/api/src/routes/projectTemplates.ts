import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { ProjectCreateFromTemplateInputSchema } from '@pkg/schema';

import { AUTH_ONLY_ROUTE_CONFIG } from '../lib/routeMeta.js';
import { requireAuth } from '../middleware/auth.js';
import { listTemplateCatalog } from '../services/projectTemplates/catalog.js';
import { createProjectFromTemplate } from '../services/projectTemplates/instantiate.js';

export const projectTemplateRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/api/project-templates',
    {
      preHandler: [requireAuth],
    },
    async () => listTemplateCatalog(),
  );

  fastify.post(
    '/api/projects/from-template',
    {
      config: AUTH_ONLY_ROUTE_CONFIG,
      preHandler: [requireAuth],
      schema: { body: ProjectCreateFromTemplateInputSchema },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      const result = await createProjectFromTemplate(request.body, user.id);
      reply.code(201);
      return { ...result.project, taskCount: result.taskCount, dependencyCount: result.dependencyCount };
    },
  );
};
