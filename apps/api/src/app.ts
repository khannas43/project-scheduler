import cookie from '@fastify/cookie';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from '@fastify/type-provider-zod';
import Fastify, { type FastifyInstance } from 'fastify';

import { env } from './env.js';
import type { RegisteredRouteInfo } from './lib/routeMeta.js';
import { registerErrorHandler } from './middleware/errors.js';
import './middleware/auth.js'; // FastifyRequest.user module augmentation
import './middleware/permissions.js'; // FastifyRequest.permissionsCache module augmentation
import { assignmentRoutes } from './routes/assignments.js';
import { authRoutes } from './routes/auth.js';
import { baselineRoutes } from './routes/baselines.js';
import { calendarRoutes } from './routes/calendars.js';
import { dependencyRoutes } from './routes/dependencies.js';
import { healthRoutes } from './routes/health.js';
import { mspdiRoutes } from './routes/mspdi.js';
import { projectRoutes } from './routes/projects.js';
import { reportRoutes } from './routes/reports.js';
import { resourceRoutes } from './routes/resources.js';
import { roleRoutes } from './routes/roles.js';
import { taskRoutes } from './routes/tasks.js';

/** Separate from server.ts (which calls .listen()) so tests can `fastify.inject()` against it (§11). */
export async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: { level: env.LOG_LEVEL } }).withTypeProvider<ZodTypeProvider>();

  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  fastify.decorateRequest('user', undefined);
  fastify.decorateRequest('permissionsCache', undefined);

  // Feeds the route-guard drift test (§6.4) — records every route as it's
  // registered, since Fastify has no direct API to enumerate them afterward.
  fastify.decorate('routeTable', []);
  fastify.addHook('onRoute', (routeOptions) => {
    const methods = Array.isArray(routeOptions.method) ? routeOptions.method : [routeOptions.method];
    const preHandlerOption = routeOptions.preHandler;
    const preHandlers = preHandlerOption
      ? Array.isArray(preHandlerOption)
        ? preHandlerOption
        : [preHandlerOption]
      : [];

    for (const method of methods) {
      const route: RegisteredRouteInfo = {
        method,
        path: routeOptions.url,
        preHandlers,
        config: routeOptions.config,
      };
      fastify.routeTable.push(route);
    }
  });

  await fastify.register(cookie);

  registerErrorHandler(fastify);

  await fastify.register(healthRoutes);
  await fastify.register(authRoutes);
  await fastify.register(projectRoutes);
  await fastify.register(taskRoutes);
  await fastify.register(dependencyRoutes);
  await fastify.register(roleRoutes);
  await fastify.register(calendarRoutes);
  await fastify.register(resourceRoutes);
  await fastify.register(assignmentRoutes);
  await fastify.register(baselineRoutes);
  await fastify.register(mspdiRoutes);
  await fastify.register(reportRoutes);

  return fastify;
}
