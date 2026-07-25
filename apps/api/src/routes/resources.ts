import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { PERMISSIONS } from '@pkg/rbac';
import { ResourceCreateInputSchema, ResourceUpdateInputSchema } from '@pkg/schema';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { UnauthorizedError } from '../middleware/errors.js';
import { requirePermissionForProject } from '../middleware/permissions.js';
import * as assignmentService from '../services/assignmentService.js';
import * as resourceService from '../services/resourceService.js';

const ProjectIdQuerySchema = z.object({
  projectId: z.uuid(),
});

const ResourceIdParamsSchema = z.object({
  id: z.uuid(),
});

const ProjectIdBodySchema = z.object({
  projectId: z.uuid(),
});

const CreateResourceBodySchema = ResourceCreateInputSchema.extend({
  projectId: z.uuid(),
});

const UpdateResourceBodySchema = ResourceUpdateInputSchema.extend({
  projectId: z.uuid(),
});

function projectIdFromQuery(request: FastifyRequest): string | undefined {
  const projectId = (request.query as { projectId?: unknown }).projectId;
  return typeof projectId === 'string' ? projectId : undefined;
}

function projectIdFromBody(request: FastifyRequest): string | undefined {
  const body = request.body as { projectId?: unknown } | null | undefined;
  return body && typeof body === 'object' && typeof body.projectId === 'string'
    ? body.projectId
    : undefined;
}

const requireResourceViewFromQuery = requirePermissionForProject(
  PERMISSIONS.RESOURCE_VIEW.key,
  projectIdFromQuery,
);

const requireResourceCreateFromBody = requirePermissionForProject(
  PERMISSIONS.RESOURCE_CREATE.key,
  projectIdFromBody,
);

const requireResourceEditFromBody = requirePermissionForProject(
  PERMISSIONS.RESOURCE_EDIT.key,
  projectIdFromBody,
);

/**
 * §5.2 resource pool routes — global catalog authorized via projectId
 * (roles pattern: projectId authorizes the caller; it does not scope the data).
 * DELETE uses body.projectId to match PATCH/POST mutations on this catalog.
 */
export const resourceRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/api/resources',
    {
      preHandler: [requireAuth, requireResourceViewFromQuery],
      schema: { querystring: ProjectIdQuerySchema },
    },
    async () => resourceService.listResources(),
  );

  fastify.get(
    '/api/resources/:id/overallocations',
    {
      preHandler: [requireAuth, requireResourceViewFromQuery],
      schema: {
        params: ResourceIdParamsSchema,
        querystring: ProjectIdQuerySchema,
      },
    },
    async (request) => assignmentService.getOverallocations(request.params.id),
  );

  fastify.post(
    '/api/resources',
    {
      preHandler: [requireAuth, requireResourceCreateFromBody],
      schema: { body: CreateResourceBodySchema },
    },
    async (request, reply) => {
      if (!request.user) throw new UnauthorizedError();
      const { projectId, ...input } = request.body;
      const created = await resourceService.createResource(input, request.user.id, projectId);
      reply.code(201);
      return created;
    },
  );

  fastify.patch(
    '/api/resources/:id',
    {
      preHandler: [requireAuth, requireResourceEditFromBody],
      schema: {
        params: ResourceIdParamsSchema,
        body: UpdateResourceBodySchema,
      },
    },
    async (request) => {
      if (!request.user) throw new UnauthorizedError();
      const { projectId, ...input } = request.body;
      return resourceService.updateResource(request.params.id, input, request.user.id, projectId);
    },
  );

  fastify.delete(
    '/api/resources/:id',
    {
      preHandler: [requireAuth, requireResourceEditFromBody],
      schema: {
        params: ResourceIdParamsSchema,
        body: ProjectIdBodySchema,
      },
    },
    async (request) => {
      if (!request.user) throw new UnauthorizedError();
      return resourceService.deleteResource(
        request.params.id,
        request.user.id,
        request.body.projectId,
      );
    },
  );
};
