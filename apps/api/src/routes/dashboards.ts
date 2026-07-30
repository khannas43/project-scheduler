import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { UnauthorizedError } from '../middleware/errors.js';
import { requirePermission } from '../middleware/permissions.js';
import {
  getPortfolioDashboard,
  getProjectDashboard,
} from '../services/dashboardService.js';

const ProjectIdParams = z.object({ id: z.uuid() });

/**
 * Phase 5 project + portfolio dashboards — compose built-in reports.
 * Project dashboard is gated by report.view; portfolio is auth-only
 * (membership filter via listProjectsForUser, same as GET /api/projects).
 */
export const dashboardRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/api/projects/:id/dashboard',
    {
      preHandler: [requireAuth, requirePermission('report.view')],
      schema: { params: ProjectIdParams },
    },
    async (request) => getProjectDashboard(request.params.id),
  );

  fastify.get(
    '/api/dashboard/portfolio',
    {
      preHandler: [requireAuth],
    },
    async (request) => {
      if (!request.user) throw new UnauthorizedError();
      return getPortfolioDashboard(request.user.id);
    },
  );
};
