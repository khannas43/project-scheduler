import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { AssignmentCreateInputSchema, AssignmentUpdateInputSchema } from '@pkg/schema';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import * as assignmentService from '../services/assignmentService.js';

const AssignmentIdParams = z.object({ id: z.uuid() });

/** §5.2 assignment routes — project resolved via taskId / assignment→task (dependencies pattern). */
export const assignmentRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    '/api/assignments',
    {
      preHandler: [requireAuth, requirePermission('resource.assign')],
      schema: { body: AssignmentCreateInputSchema },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      const created = await assignmentService.createAssignment(request.body, user.id);
      reply.code(201);
      return created;
    },
  );

  fastify.patch(
    '/api/assignments/:id',
    {
      preHandler: [requireAuth, requirePermission('resource.assign')],
      schema: {
        params: AssignmentIdParams,
        body: AssignmentUpdateInputSchema,
      },
    },
    async (request) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      return assignmentService.updateAssignment(request.params.id, request.body, user.id);
    },
  );

  fastify.delete(
    '/api/assignments/:id',
    {
      preHandler: [requireAuth, requirePermission('resource.assign')],
      schema: { params: AssignmentIdParams },
    },
    async (request) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      return assignmentService.deleteAssignment(request.params.id, user.id);
    },
  );

  fastify.get(
    '/api/assignments/:id/timephased',
    {
      preHandler: [requireAuth, requirePermission('resource.assign')],
      schema: { params: AssignmentIdParams },
    },
    async (request) => assignmentService.listTimephasedForAssignment(request.params.id),
  );
};
