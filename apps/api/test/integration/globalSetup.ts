import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const URL_FILE = fileURLToPath(new URL('./.db-url', import.meta.url));

export default async function setup(): Promise<() => Promise<void>> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const connectionUri = container.getConnectionUri();
  writeFileSync(URL_FILE, connectionUri, 'utf8');

  process.env.DATABASE_URL = connectionUri;
  process.env.JWT_SECRET ??= 'integration-test-secret-do-not-use';
  process.env.SEED_ADMIN_EMAIL ??= 'admin@example.com';
  process.env.SEED_ADMIN_PASSWORD ??= 'change-me';
  process.env.ARGON2_MEMORY_KB ??= '8192';

  const client = postgres(connectionUri, { max: 1 });
  const db = drizzle(client);
  const migrationsFolder = fileURLToPath(new URL('../../src/db/migrations', import.meta.url));
  await migrate(db, { migrationsFolder });
  await client.end();

  return async () => {
    await container.stop();
  };
}
