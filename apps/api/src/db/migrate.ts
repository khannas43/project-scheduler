import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { env } from '../env.js';

async function main() {
  // A dedicated single connection for migrations, per drizzle-orm's guidance —
  // separate from the pooled connection apps/api uses at runtime (client.ts).
  const migrationClient = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(migrationClient);

  await migrate(db, { migrationsFolder: './src/db/migrations' });

  await migrationClient.end();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
