import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { TaskNotifyInputSchema } from '@pkg/schema';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { notifyTaskAssignees } from '../services/taskNotifyService.js';

export const taskNotifyRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    '/api/tasks/:id/notify',
    {
      preHandler: [requireAuth, requirePermission('project.edit')],
      schema: {
        params: z.object({ id: z.uuid() }),
        body: TaskNotifyInputSchema.optional(),
      },
    },
    async (request) => {
      if (!request.user) throw new Error('requireAuth must run first');
      return notifyTaskAssignees(request.params.id, request.user.id, request.body?.note);
    },
  );
};
