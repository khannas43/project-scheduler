import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { levelProject, undoLevelProject } from '../services/levelingService.js';

const ProjectIdParams = z.object({ id: z.uuid() });

const LevelBodySchema = z.object({
  dryRun: z.boolean().optional(),
  resourceIds: z.array(z.uuid()).optional(),
  /** When set, only these tasks may be delayed; others still count toward load. */
  taskIds: z.array(z.uuid()).optional(),
  withinFloat: z.enum(['free', 'total']).optional(),
  maxMoves: z.number().int().min(1).max(200).optional(),
});

/** Heuristic resource leveling — preview/apply + undo last apply. */
export const levelingRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    '/api/projects/:id/level',
    {
      preHandler: [requireAuth, requirePermission('task.edit')],
      schema: { params: ProjectIdParams, body: LevelBodySchema },
    },
    async (request) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      const { dryRun, resourceIds, taskIds, withinFloat, maxMoves } = request.body;
      return levelProject(
        request.params.id,
        {
          ...(dryRun !== undefined ? { dryRun } : {}),
          ...(resourceIds !== undefined ? { resourceIds } : {}),
          ...(taskIds !== undefined ? { taskIds } : {}),
          ...(withinFloat !== undefined ? { withinFloat } : {}),
          ...(maxMoves !== undefined ? { maxMoves } : {}),
        },
        user.id,
      );
    },
  );

  fastify.post(
    '/api/projects/:id/level/undo',
    {
      preHandler: [requireAuth, requirePermission('task.edit')],
      schema: { params: ProjectIdParams },
    },
    async (request) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      return undoLevelProject(request.params.id, user.id);
    },
  );
};
