import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { ProjectMemberCreateInputSchema, ProjectMemberUpdateInputSchema, TaskNotifyInputSchema } from '@pkg/schema';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import * as memberService from '../services/memberService.js';
import { notifyMemberTasks } from '../services/taskNotifyService.js';

const ProjectIdParams = z.object({ id: z.uuid() });
const MemberParams = z.object({ id: z.uuid(), userId: z.uuid() });

export const memberRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/api/projects/:id/members',
    {
      preHandler: [requireAuth, requirePermission('project.view')],
      schema: { params: ProjectIdParams },
    },
    async (request) => memberService.listMembers(request.params.id),
  );

  fastify.post(
    '/api/projects/:id/members',
    {
      preHandler: [requireAuth, requirePermission('project.edit')],
      schema: { params: ProjectIdParams, body: ProjectMemberCreateInputSchema },
    },
    async (request, reply) => {
      if (!request.user) throw new Error('requireAuth must run first');
      const member = await memberService.addMember(request.params.id, request.body, request.user.id);
      reply.code(201);
      return member;
    },
  );

  fastify.patch(
    '/api/projects/:id/members/:userId',
    {
      preHandler: [requireAuth, requirePermission('project.edit')],
      schema: { params: MemberParams, body: ProjectMemberUpdateInputSchema },
    },
    async (request) => {
      if (!request.user) throw new Error('requireAuth must run first');
      return memberService.updateMemberRole(
        request.params.id,
        request.params.userId,
        request.body.roleId,
        request.user.id,
      );
    },
  );

  fastify.delete(
    '/api/projects/:id/members/:userId',
    {
      preHandler: [requireAuth, requirePermission('project.edit')],
      schema: { params: MemberParams },
    },
    async (request, reply) => {
      if (!request.user) throw new Error('requireAuth must run first');
      await memberService.removeMember(request.params.id, request.params.userId, request.user.id);
      reply.code(204);
      return null;
    },
  );

  fastify.post(
    '/api/projects/:id/members/:userId/notify-tasks',
    {
      preHandler: [requireAuth, requirePermission('project.edit')],
      schema: { params: MemberParams, body: TaskNotifyInputSchema.optional() },
    },
    async (request) => {
      if (!request.user) throw new Error('requireAuth must run first');
      return notifyMemberTasks(
        request.params.id,
        request.params.userId,
        request.user.id,
        request.body?.note,
      );
    },
  );
};
