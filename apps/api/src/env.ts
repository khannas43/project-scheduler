import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

if (existsSync('.env')) {
  loadEnvFile('.env');
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function optionalIntEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer, got: ${value}`);
  }
  return parsed;
}

export const env = {
  NODE_ENV: optionalEnv('NODE_ENV', 'development'),
  PORT: optionalIntEnv('PORT', 3000),
  LOG_LEVEL: optionalEnv('LOG_LEVEL', 'info'),
  CORS_ORIGIN: optionalEnv('CORS_ORIGIN', 'http://localhost:8080'),

  DATABASE_URL: requireEnv('DATABASE_URL'),

  JWT_SECRET: requireEnv('JWT_SECRET'),
  JWT_ACCESS_TTL: optionalEnv('JWT_ACCESS_TTL', '15m'),
  JWT_REFRESH_TTL: optionalEnv('JWT_REFRESH_TTL', '7d'),

  // Appendix B's documented default.
  ARGON2_MEMORY_KB: optionalIntEnv('ARGON2_MEMORY_KB', 65536),

  // Only read by seed.ts — lazy getters so other entrypoints don't require them.
  get SEED_ADMIN_EMAIL(): string {
    return requireEnv('SEED_ADMIN_EMAIL');
  },
  get SEED_ADMIN_PASSWORD(): string {
    return requireEnv('SEED_ADMIN_PASSWORD');
  },

  SMTP_HOST: optionalEnv('SMTP_HOST', ''),
  SMTP_PORT: optionalIntEnv('SMTP_PORT', 587),
  SMTP_SECURE: optionalEnv('SMTP_SECURE', 'false'),
  SMTP_USER: optionalEnv('SMTP_USER', ''),
  SMTP_PASS: optionalEnv('SMTP_PASS', ''),
  SMTP_FROM: optionalEnv('SMTP_FROM', ''),
  APP_BASE_URL: optionalEnv('APP_BASE_URL', 'http://localhost:5173'),
};
