import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { ProjectCreateInputSchema, ProjectUpdateInputSchema } from '@pkg/schema';
import { z } from 'zod';

import { AUTH_ONLY_ROUTE_CONFIG } from '../lib/routeMeta.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import * as projectService from '../services/projectService.js';

const ProjectIdParams = z.object({ id: z.uuid() });

/**
 * Body for POST /api/projects — ownerId from auth; calendarId optional
 * (service inserts a default Mon–Fri calendar when omitted).
 */
const ProjectCreateBodySchema = ProjectCreateInputSchema.omit({ ownerId: true }).partial({
  calendarId: true,
});

/** §5.2 project routes — HTTP only; business logic in projectService. */
export const projectRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/api/projects',
    {
      // Membership filter is the authorization — no single project to resolve.
      preHandler: [requireAuth],
    },
    async (request) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      return projectService.listProjectsForUser(user.id);
    },
  );

  fastify.post(
    '/api/projects',
    {
      // No project exists yet to check a permission against.
      config: AUTH_ONLY_ROUTE_CONFIG,
      preHandler: [requireAuth],
      schema: { body: ProjectCreateBodySchema },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      const project = await projectService.createProject(request.body, user.id);
      reply.code(201);
      return project;
    },
  );

  fastify.get(
    '/api/projects/:id',
    {
      preHandler: [requireAuth, requirePermission('project.view')],
      schema: { params: ProjectIdParams },
    },
    async (request) => {
      return projectService.getProject(request.params.id);
    },
  );

  fastify.patch(
    '/api/projects/:id',
    {
      preHandler: [requireAuth, requirePermission('project.edit')],
      schema: { params: ProjectIdParams, body: ProjectUpdateInputSchema },
    },
    async (request) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      return projectService.updateProject(request.params.id, request.body, user.id);
    },
  );

  fastify.delete(
    '/api/projects/:id',
    {
      preHandler: [requireAuth, requirePermission('project.delete')],
      schema: { params: ProjectIdParams },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      await projectService.deleteProject(request.params.id, user.id);
      reply.code(204);
      return null;
    },
  );
};
