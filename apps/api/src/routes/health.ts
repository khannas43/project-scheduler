import type { FastifyPluginAsync } from 'fastify';

import { sql } from '../db/client.js';

/** Liveness (/health) vs readiness (/ready, checks the database) — used by compose.yaml's healthcheck. */
export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => ({ status: 'ok' }));

  fastify.get('/ready', async (_request, reply) => {
    try {
      await sql`select 1`;
      return { status: 'ok' };
    } catch {
      reply.code(503);
      return { status: 'unavailable' };
    }
  });
};
