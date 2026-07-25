import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { PERMISSIONS } from '@pkg/rbac';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { UnauthorizedError } from '../middleware/errors.js';
import { requirePermissionForProject } from '../middleware/permissions.js';
import * as roleService from '../services/roleService.js';

const RoleSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  permissionKeys: z.array(z.string()),
});

const PermissionSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  category: z.string(),
  description: z.string(),
});

const ProjectIdQuerySchema = z.object({
  projectId: z.uuid(),
});

const RoleIdParamsSchema = z.object({
  id: z.uuid(),
});

const CreateRoleBodySchema = z.object({
  projectId: z.uuid(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  permissionKeys: z.array(z.string()).min(1),
});

const UpdateRoleBodySchema = z.object({
  projectId: z.uuid(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  permissionKeys: z.array(z.string()).optional(),
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

const requireRoleManageFromQuery = requirePermissionForProject(
  PERMISSIONS.ROLE_MANAGE.key,
  projectIdFromQuery,
);

const requireRoleManageFromBody = requirePermissionForProject(
  PERMISSIONS.ROLE_MANAGE.key,
  projectIdFromBody,
);

/** §5.2: GET/POST /api/roles, PATCH /api/roles/:id, GET /api/permissions. */
export const roleRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/api/roles',
    {
      preHandler: [requireAuth, requireRoleManageFromQuery],
      schema: {
        querystring: ProjectIdQuerySchema,
        response: { 200: z.array(RoleSchema) },
      },
    },
    async () => roleService.listRoles(),
  );

  fastify.post(
    '/api/roles',
    {
      preHandler: [requireAuth, requireRoleManageFromBody],
      schema: {
        body: CreateRoleBodySchema,
        response: { 201: RoleSchema },
      },
    },
    async (request, reply) => {
      if (!request.user) throw new UnauthorizedError();
      const { projectId, name, description, permissionKeys } = request.body;
      const role = await roleService.createRole(
        {
          name,
          description: description ?? null,
          permissionKeys,
        },
        request.user.id,
        projectId,
      );
      reply.code(201);
      return role;
    },
  );

  fastify.patch(
    '/api/roles/:id',
    {
      preHandler: [requireAuth, requireRoleManageFromBody],
      schema: {
        params: RoleIdParamsSchema,
        body: UpdateRoleBodySchema,
        response: { 200: RoleSchema },
      },
    },
    async (request) => {
      if (!request.user) throw new UnauthorizedError();
      const { projectId, name, description, permissionKeys } = request.body;
      return roleService.updateRole(
        request.params.id,
        {
          ...(name !== undefined ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(permissionKeys !== undefined ? { permissionKeys } : {}),
        },
        request.user.id,
        projectId,
      );
    },
  );

  fastify.get(
    '/api/permissions',
    {
      preHandler: [requireAuth, requireRoleManageFromQuery],
      schema: {
        querystring: ProjectIdQuerySchema,
        response: { 200: z.array(PermissionSchema) },
      },
    },
    async () => roleService.listPermissions(),
  );
};
