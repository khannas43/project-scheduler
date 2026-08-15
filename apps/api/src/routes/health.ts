import type { FastifyPluginAsync } from 'fastify';

import { sql } from '../db/client.js';
import { PUBLIC_ROUTE_CONFIG } from '../lib/routeMeta.js';

/**
 * Liveness vs readiness:
 * - GET /health — process is up (compose liveness; no DB)
 * - GET /ready — DB reachable (orchestration readiness / dependency check)
 */
export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/health',
    { config: PUBLIC_ROUTE_CONFIG },
    async () => ({ status: 'ok', check: 'liveness' as const }),
  );

  fastify.get(
    '/ready',
    { config: PUBLIC_ROUTE_CONFIG },
    async (_request, reply) => {
      try {
        await sql`select 1`;
        return { status: 'ok', check: 'readiness' as const };
      } catch (err) {
        _request.log.error({ err }, 'readiness_db_failed');
        return reply.code(503).type('application/problem+json').send({
          type: 'about:blank',
          title: 'ServiceUnavailable',
          status: 503,
          detail: 'Database is not reachable',
          code: 'not_ready',
          check: 'readiness',
        });
      }
    },
  );
};
