// scripts/migrate-runtime.ts
//
// Applies migrations from INSIDE the deployed container.
//
// Railway's Postgres has no public endpoint, so neither GitHub Actions nor a
// developer's laptop can reach it — `postgres.railway.internal` resolves only
// within the project's private network. The alternative, exposing the database
// through a public TCP proxy purely so CI can migrate it, widens the attack
// surface of the one service that holds every customer record.
//
// So this runs as Railway's preDeployCommand: once per release, before the new
// version takes traffic, on the private network. If it fails the release does
// not go live, which is the behaviour you want — a half-migrated schema serving
// requests is worse than an old version still serving them.
//
// Bundled by esbuild into a single CommonJS file at build time, because the
// runtime image is Next's standalone output: it contains only the dependencies
// Next traced from the app, and drizzle-kit is a devDependency that is not
// there at all.
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await migrate(drizzle(client), { migrationsFolder: './lib/db/migrations' });
    console.log('✅ migrations applied');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  // Loud and non-zero: Railway aborts the release rather than promoting a
  // container whose schema does not match its code.
  console.error('❌ migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
