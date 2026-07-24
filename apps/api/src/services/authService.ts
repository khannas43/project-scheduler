import argon2 from 'argon2';
import { eq } from 'drizzle-orm';

import { db } from '../db/client.js';
import { users } from '../db/schema/index.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt.js';
import { UnauthorizedError } from '../middleware/errors.js';

export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface AuthenticatedUserInfo {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
}

export async function login(email: string, password: string): Promise<AuthTokens & { user: AuthenticatedUserInfo }> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  // Same message either way — don't leak whether the email exists.
  if (!user || !user.isActive) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const passwordValid = await argon2.verify(user.passwordHash, password);
  if (!passwordValid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(user.id, user.email),
    signRefreshToken(user.id),
  ]);

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, fullName: user.fullName },
  };
}

/**
 * v1 is stateless (no refresh_tokens table — see ADR 001): the incoming
 * refresh token is verified and a brand new access + refresh pair is issued.
 * The client's cookie is overwritten, so the old refresh token is no longer
 * *used*, but nothing revokes its signature server-side before its own
 * expiry if it were captured and replayed.
 */
export async function refresh(refreshToken: string): Promise<AuthTokens> {
  let userId: string;
  try {
    const payload = await verifyRefreshToken(refreshToken);
    userId = payload.sub;
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.isActive) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const [accessToken, newRefreshToken] = await Promise.all([
    signAccessToken(user.id, user.email),
    signRefreshToken(user.id),
  ]);

  return { accessToken, refreshToken: newRefreshToken };
}
