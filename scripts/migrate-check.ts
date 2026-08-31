// scripts/migrate-check.ts
//
// Proves the migration chain builds a working database FROM EMPTY.
//
// It had never been run end to end: most of this schema was created with
// `db:push` and hand-written ALTERs, so the folder drifted, and the catch-up
// migration drizzle generated collided with an earlier hand-written one. That
// combination fails only on a fresh database — which is to say, only in
// production, on the first deploy, when nobody is watching.
//
// Creates a scratch database, migrates it, checks the result, drops it. Uses an
// explicit connection rather than the drizzle-kit CLI, which auto-loads .env and
// will quietly redirect the run at the real database.
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const NAME = process.env.MIGRATE_CHECK_DB ?? 'aeon_migrate_check';

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  const base = `${url.protocol}//${url.username}:${url.password}@${url.host}`;

  const admin = new Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${NAME}`);
  await admin.query(`CREATE DATABASE ${NAME}`);
  await admin.end();

  const c = new Client({ connectionString: `${base}/${NAME}` });
  await c.connect();

  try {
    await migrate(drizzle(c), { migrationsFolder: './lib/db/migrations' });

    const tables = await c.query<{ n: number }>(
      `select count(*)::int n from information_schema.tables where table_schema='public'`
    );

    // A table count alone would pass on a half-built schema, so query the
    // tables the app cannot boot without.
    for (const t of ['settings', 'products', 'product_i18n', 'content', 'orders', 'customers']) {
      await c.query(`select 1 from ${t} limit 1`);
    }
    // The order number generator, which is the collision this script exists for.
    await c.query(`select nextval('order_number_seq')`);

    console.log(`✅ migrations build ${tables.rows[0]!.n} tables from empty, and the app's core tables are queryable`);
  } finally {
    await c.end();
    const a = new Client({ connectionString: `${base}/postgres` });
    await a.connect();
    await a.query(`DROP DATABASE IF EXISTS ${NAME}`);
    await a.end();
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('❌ the migration chain does not build a working database:\n  ', e.message);
  process.exit(1);
});
