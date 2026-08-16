import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const urlFile = fileURLToPath(new URL('./.db-url', import.meta.url));
if (existsSync(urlFile)) {
  process.env.DATABASE_URL = readFileSync(urlFile, 'utf8').trim();
}

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET ??= 'integration-test-secret-do-not-use';
process.env.SEED_ADMIN_EMAIL ??= 'admin@example.com';
process.env.SEED_ADMIN_PASSWORD ??= 'change-me';
process.env.ARGON2_MEMORY_KB ??= '8192';
