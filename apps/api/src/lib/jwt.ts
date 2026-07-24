import { randomUUID } from 'node:crypto';

import { SignJWT, jwtVerify } from 'jose';

import { env } from '../env.js';

const secretKey = new TextEncoder().encode(env.JWT_SECRET);

export interface AccessTokenPayload {
  readonly sub: string;
  readonly email: string;
}

export interface RefreshTokenPayload {
  readonly sub: string;
  readonly jti: string;
}

export async function signAccessToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ email, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_TTL)
    .sign(secretKey);
}

export async function signRefreshToken(userId: string): Promise<string> {
  return new SignJWT({ type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(env.JWT_REFRESH_TTL)
    .sign(secretKey);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, secretKey);
  if (payload.type !== 'access' || typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
    throw new Error('Not a valid access token');
  }
  return { sub: payload.sub, email: payload.email };
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  const { payload } = await jwtVerify(token, secretKey);
  if (payload.type !== 'refresh' || typeof payload.sub !== 'string' || typeof payload.jti !== 'string') {
    throw new Error('Not a valid refresh token');
  }
  return { sub: payload.sub, jti: payload.jti };
}
