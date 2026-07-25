import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { CalendarExceptionCreateInputSchema } from '@pkg/schema';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import * as calendarExceptionService from '../services/calendarExceptionService.js';

const CalendarIdParams = z.object({ id: z.uuid() });
const ExceptionIdParams = z.object({ id: z.uuid() });

/** Calendar-exception routes — HTTP only; business logic in calendarExceptionService. */
export const calendarRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/api/calendars/:id/exceptions',
    {
      preHandler: [requireAuth, requirePermission('calendar.manage')],
      schema: { params: CalendarIdParams },
    },
    async (request) => {
      return calendarExceptionService.listExceptions(request.params.id);
    },
  );

  fastify.post(
    '/api/calendars/:id/exceptions',
    {
      preHandler: [requireAuth, requirePermission('calendar.manage')],
      schema: { params: CalendarIdParams, body: CalendarExceptionCreateInputSchema },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      const result = await calendarExceptionService.createException(
        request.params.id,
        request.body,
        user.id,
      );
      reply.code(201);
      return result;
    },
  );

  fastify.delete(
    '/api/calendar-exceptions/:id',
    {
      preHandler: [requireAuth, requirePermission('calendar.manage')],
      schema: { params: ExceptionIdParams },
    },
    async (request) => {
      const user = request.user;
      if (!user) throw new Error('requireAuth must run first');
      return calendarExceptionService.deleteException(request.params.id, user.id);
    },
  );
};
