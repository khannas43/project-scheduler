import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { PERMISSIONS } from '@pkg/rbac';
import { UserCreateInputSchema, UserUpdateInputSchema } from '@pkg/schema';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { requirePermissionForProject } from '../middleware/permissions.js';
import * as userService from '../services/userService.js';

const ProjectIdQuerySchema = z.object({
  projectId: z.uuid(),
});

function projectIdFromQuery(request: FastifyRequest): string | undefined {
  const projectId = (request.query as { projectId?: unknown }).projectId;
  return typeof projectId === 'string' ? projectId : undefined;
}

function projectIdFromBody(request: FastifyRequest): string | undefined {
  const body = request.body as { projectId?: unknown } | null | undefined;
  return body && typeof body === 'object' && typeof body.projectId === 'string'
    ? body.projectId
    : undefined;
}

const requireUserManageFromBody = requirePermissionForProject(
  PERMISSIONS.USER_MANAGE.key,
  projectIdFromBody,
);

const requireProjectEditFromQuery = requirePermissionForProject(
  PERMISSIONS.PROJECT_EDIT.key,
  projectIdFromQuery,
);

export const userRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/api/users',
    {
      preHandler: [requireAuth, requireProjectEditFromQuery],
      schema: { querystring: ProjectIdQuerySchema },
    },
    async () => userService.listUsers(),
  );

  fastify.post(
    '/api/users',
    {
      preHandler: [requireAuth, requireUserManageFromBody],
      schema: { body: UserCreateInputSchema },
    },
    async (request, reply) => {
      if (!request.user) throw new Error('requireAuth must run first');
      const user = await userService.createUser(request.body, request.user.id);
      reply.code(201);
      return user;
    },
  );

  fastify.patch(
    '/api/users/:id',
    {
      preHandler: [requireAuth, requireUserManageFromBody],
      schema: {
        params: z.object({ id: z.uuid() }),
        body: UserUpdateInputSchema,
      },
    },
    async (request) => {
      if (!request.user) throw new Error('requireAuth must run first');
      return userService.updateUser(request.params.id, request.body, request.user.id);
    },
  );
};
