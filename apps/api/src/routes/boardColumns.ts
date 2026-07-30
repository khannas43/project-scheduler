import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { BoardColumnCreateBodySchema, BoardColumnUpdateInputSchema } from '@pkg/schema';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import * as boardColumnService from '../services/boardColumnService.js';

const ProjectIdParams = z.object({ id: z.uuid() });
const BoardColumnIdParams = z.object({ id: z.uuid() });

export const boardColumnRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    '/api/projects/:id/board-columns',
    {
      preHandler: [requireAuth, requirePermission('board.manage')],
      schema: { params: ProjectIdParams, body: BoardColumnCreateBodySchema },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      const created = await boardColumnService.createBoardColumn(
        request.params.id,
        request.body,
        user.id,
      );
      reply.code(201);
      return created;
    },
  );

  fastify.get(
    '/api/projects/:id/board-columns',
    {
      preHandler: [requireAuth, requirePermission('board.view')],
      schema: { params: ProjectIdParams },
    },
    async (request) => boardColumnService.listBoardColumns(request.params.id),
  );

  fastify.patch(
    '/api/board-columns/:id',
    {
      preHandler: [requireAuth, requirePermission('board.manage')],
      schema: { params: BoardColumnIdParams, body: BoardColumnUpdateInputSchema },
    },
    async (request) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      return boardColumnService.updateBoardColumn(request.params.id, request.body, user.id);
    },
  );

  fastify.delete(
    '/api/board-columns/:id',
    {
      preHandler: [requireAuth, requirePermission('board.manage')],
      schema: { params: BoardColumnIdParams },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      await boardColumnService.deleteBoardColumn(request.params.id, user.id);
      reply.code(204);
      return null;
    },
  );
};
