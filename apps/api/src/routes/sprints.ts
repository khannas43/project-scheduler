import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import {
  SprintCloseInputSchema,
  SprintCreateBodySchema,
  SprintUpdateInputSchema,
} from '@pkg/schema';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import * as sprintService from '../services/sprintService.js';

const ProjectIdParams = z.object({ id: z.uuid() });
const SprintIdParams = z.object({ id: z.uuid() });

export const sprintRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    '/api/projects/:id/sprints',
    {
      preHandler: [requireAuth, requirePermission('sprint.create')],
      schema: { params: ProjectIdParams, body: SprintCreateBodySchema },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      const created = await sprintService.createSprint(request.params.id, request.body, user.id);
      reply.code(201);
      return created;
    },
  );

  fastify.get(
    '/api/projects/:id/sprints',
    {
      preHandler: [requireAuth, requirePermission('sprint.view')],
      schema: { params: ProjectIdParams },
    },
    async (request) => sprintService.listSprints(request.params.id),
  );

  fastify.patch(
    '/api/sprints/:id',
    {
      preHandler: [requireAuth, requirePermission('sprint.edit')],
      schema: { params: SprintIdParams, body: SprintUpdateInputSchema },
    },
    async (request) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      return sprintService.updateSprint(request.params.id, request.body, user.id);
    },
  );

  fastify.delete(
    '/api/sprints/:id',
    {
      preHandler: [requireAuth, requirePermission('sprint.edit')],
      schema: { params: SprintIdParams },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      await sprintService.deleteSprint(request.params.id, user.id);
      reply.code(204);
      return null;
    },
  );

  fastify.post(
    '/api/sprints/:id/close',
    {
      preHandler: [requireAuth, requirePermission('sprint.edit')],
      schema: { params: SprintIdParams, body: SprintCloseInputSchema },
    },
    async (request) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      return sprintService.closeSprint(
        request.params.id,
        request.body.carryOverToSprintId,
        user.id,
      );
    },
  );
};
