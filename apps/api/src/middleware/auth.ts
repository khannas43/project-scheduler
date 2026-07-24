import type { FastifyRequest } from 'fastify';

import { verifyAccessToken } from '../lib/jwt.js';
import { UnauthorizedError } from './errors.js';

export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

const BEARER_PREFIX = 'Bearer ';

/** §5.1: Authorization: Bearer <jwt>. Attaches the verified user to request context. */
export async function requireAuth(request: FastifyRequest): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith(BEARER_PREFIX)) {
    throw new UnauthorizedError();
  }

  const token = header.slice(BEARER_PREFIX.length);

  try {
    const payload = await verifyAccessToken(token);
    request.user = { id: payload.sub, email: payload.email };
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}
