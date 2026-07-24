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
  DATABASE_URL: requireEnv('DATABASE_URL'),
  // Only read by seed.ts — lazy getters so migrate/client don't require them.
  get SEED_ADMIN_EMAIL(): string {
    return requireEnv('SEED_ADMIN_EMAIL');
  },
  get SEED_ADMIN_PASSWORD(): string {
    return requireEnv('SEED_ADMIN_PASSWORD');
  },
  // Appendix B's documented default.
  ARGON2_MEMORY_KB: optionalIntEnv('ARGON2_MEMORY_KB', 65536),
};
