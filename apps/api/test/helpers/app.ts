import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../src/app.js';

/** Build a Fastify app for inject tests; caller must `await app.close()`. */
export async function buildTestApp(): Promise<FastifyInstance> {
  return buildApp();
}
