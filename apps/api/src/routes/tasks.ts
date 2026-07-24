import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import {
  TaskCreateInputSchema,
  TaskMoveInputSchema,
  TaskUpdateInputSchema,
} from '@pkg/schema';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import * as taskService from '../services/taskService.js';

const ProjectIdParams = z.object({ id: z.uuid() });
const TaskIdParams = z.object({ id: z.uuid() });

/** Body for POST /api/projects/:id/tasks — projectId comes from the path. */
const TaskCreateBodySchema = TaskCreateInputSchema.omit({ projectId: true });

/** §5.2 task routes — HTTP only; business logic in taskService. */
export const taskRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/api/projects/:id/tasks',
    {
      preHandler: [requireAuth, requirePermission('task.view')],
      schema: { params: ProjectIdParams },
    },
    async (request) => {
      return taskService.listProjectTasks(request.params.id);
    },
  );

  fastify.post(
    '/api/projects/:id/tasks',
    {
      preHandler: [requireAuth, requirePermission('task.create')],
      schema: { params: ProjectIdParams, body: TaskCreateBodySchema },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      const task = await taskService.createTask(request.params.id, request.body, user.id);
      reply.code(201);
      return task;
    },
  );

  fastify.patch(
    '/api/tasks/:id',
    {
      preHandler: [requireAuth, requirePermission('task.edit')],
      schema: { params: TaskIdParams, body: TaskUpdateInputSchema },
    },
    async (request) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      return taskService.updateTask(request.params.id, request.body, user.id);
    },
  );

  fastify.delete(
    '/api/tasks/:id',
    {
      preHandler: [requireAuth, requirePermission('task.delete')],
      schema: { params: TaskIdParams },
    },
    async (request) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      return taskService.deleteTask(request.params.id, user.id);
    },
  );

  fastify.post(
    '/api/tasks/:id/move',
    {
      preHandler: [requireAuth, requirePermission('task.reorder')],
      schema: { params: TaskIdParams, body: TaskMoveInputSchema },
    },
    async (request) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      return taskService.moveTask(request.params.id, request.body, user.id);
    },
  );
};
