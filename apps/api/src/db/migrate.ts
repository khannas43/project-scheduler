import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { env } from '../env.js';

async function main() {
  // A dedicated single connection for migrations, per drizzle-orm's guidance —
  // separate from the pooled connection apps/api uses at runtime (client.ts).
  const migrationClient = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(migrationClient);

  // Resolved relative to this module, not process.cwd() — identical whether
  // run via `tsx` from source or as compiled JS in the Docker migrate
  // init container (§10.2), which runs from a different working directory.
  const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));
  await migrate(db, { migrationsFolder });

  await migrationClient.end();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
