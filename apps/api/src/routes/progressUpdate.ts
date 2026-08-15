import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { updateProjectProgress } from '../services/progressUpdateService.js';

const ProjectIdParams = z.object({ id: z.uuid() });

const ProgressUpdateBodySchema = z.object({
  dryRun: z.boolean().optional(),
  statusDate: z.string().min(1),
  taskIds: z.array(z.uuid()).optional(),
  updateAsScheduled: z.boolean().optional(),
  setPercentComplete: z.number().min(0).max(100).optional(),
  rescheduleIncomplete: z.boolean().optional(),
});

/** Status-date progress update — preview/apply as-scheduled % and/or reschedule incomplete. */
export const progressUpdateRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    '/api/projects/:id/progress-update',
    {
      preHandler: [requireAuth, requirePermission('task.edit')],
      schema: { params: ProjectIdParams, body: ProgressUpdateBodySchema },
    },
    async (request) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      const { dryRun, statusDate, taskIds, updateAsScheduled, setPercentComplete, rescheduleIncomplete } =
        request.body;
      return updateProjectProgress(
        request.params.id,
        {
          statusDate,
          ...(dryRun !== undefined ? { dryRun } : {}),
          ...(taskIds !== undefined ? { taskIds } : {}),
          ...(updateAsScheduled !== undefined ? { updateAsScheduled } : {}),
          ...(setPercentComplete !== undefined ? { setPercentComplete } : {}),
          ...(rescheduleIncomplete !== undefined ? { rescheduleIncomplete } : {}),
        },
        user.id,
      );
    },
  );
};
