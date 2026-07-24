import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';

import { env } from '../env.js';
import { parseDurationToSeconds } from '../lib/duration.js';
import { UnauthorizedError } from '../middleware/errors.js';
import * as authService from '../services/authService.js';

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/auth';

const LoginBodySchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

const UserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  fullName: z.string(),
});

const AccessTokenResponseSchema = z.object({
  accessToken: z.string(),
});

const LoginResponseSchema = AccessTokenResponseSchema.extend({
  user: UserSchema,
});

function setRefreshCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: parseDurationToSeconds(env.JWT_REFRESH_TTL),
  });
}

/** §5.2: POST /api/auth/{login,refresh,logout}. HTTP only — logic lives in services/authService.ts (§2). */
export const authRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    '/api/auth/login',
    {
      schema: {
        body: LoginBodySchema,
        response: { 200: LoginResponseSchema },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const result = await authService.login(email, password);
      setRefreshCookie(reply, result.refreshToken);
      return { accessToken: result.accessToken, user: result.user };
    },
  );

  fastify.post(
    '/api/auth/refresh',
    {
      schema: {
        response: { 200: AccessTokenResponseSchema },
      },
    },
    async (request, reply) => {
      const token = request.cookies[REFRESH_COOKIE_NAME];
      if (!token) {
        throw new UnauthorizedError('Missing refresh token');
      }
      const result = await authService.refresh(token);
      setRefreshCookie(reply, result.refreshToken);
      return { accessToken: result.accessToken };
    },
  );

  fastify.post('/api/auth/logout', async (_request, reply) => {
    // Stateless in v1 (ADR 001) — nothing to revoke server-side, just drop the cookie.
    reply.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
    reply.code(204);
    return null;
  });
};
