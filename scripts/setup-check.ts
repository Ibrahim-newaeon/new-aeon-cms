// scripts/setup-check.ts
//
// Proves the setup wizard can only ever run ONCE, against a real database.
//
// /api/setup creates an administrator without authentication, so "it cannot run
// twice" is the single property standing between a fresh deploy and a stranger
// owning the CMS. A read-then-write guard would leave a window where two
// simultaneous requests both see zero admins and both create an owner, and no
// unit test with a mocked database can show whether the real SQL closes it.
//
// So this runs the real install() against a scratch database: once, then again,
// then ten at the same time.
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import Module from 'module';

/**
 * Neutralises `server-only` for this script.
 *
 * lib/setup/* import it so that a stray client-side import fails loudly at
 * build time — a guard worth keeping, since these modules hold the database
 * pool and the password hasher. It also refuses to load in a plain Node
 * process, which is exactly what this script is. Stubbing the resolution here
 * keeps the protection where it matters and lets the real code be tested.
 */
const resolve = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })
  ._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (
  this: unknown,
  request: string,
  ...args: unknown[]
) {
  if (request === 'server-only') return resolve.call(this, 'path', ...args);
  return resolve.call(this, request, ...args);
};

const NAME = 'aeon_setup_check';

const INPUT = {
  siteName: 'Check Shop',
  name: 'First Owner',
  email: 'first@example.test',
  password: 'a-very-long-password-123',
  defaultLocale: 'ar' as const,
  commerce: true,
  demoContent: true,
};


/**
 * Postgres refuses to drop a database that anything is still connected to, and
 * the app's own pool stays open for the life of the process — importing
 * lib/db creates it and nothing here can politely close it. Evicting the other
 * sessions first is what makes this script re-runnable.
 */
async function dropDatabase(admin: Client, name: string) {
  await admin.query(
    `select pg_terminate_backend(pid) from pg_stat_activity
      where datname = $1 and pid <> pg_backend_pid()`,
    [name]
  );
  await admin.query(`DROP DATABASE IF EXISTS ${name}`);
}

async function main() {
  const original = new URL(process.env.DATABASE_URL!);
  const base = `${original.protocol}//${original.username}:${original.password}@${original.host}`;

  const admin = new Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await dropDatabase(admin, NAME);
  await admin.query(`CREATE DATABASE ${NAME}`);
  await admin.end();

  const scratch = `${base}/${NAME}`;

  const setup = new Client({ connectionString: scratch });
  await setup.connect();
  await migrate(drizzle(setup), { migrationsFolder: './lib/db/migrations' });
  await setup.end();

  // Pointed at the scratch database BEFORE the app modules load: lib/db builds
  // its pool from the environment at import time.
  process.env.DATABASE_URL = scratch;
  const { install } = await import('../lib/setup/install');
  const { resetInstalledMemo } = await import('../lib/setup/status');

  /**
   * The app's pool is never closed by this script, so when the scratch database
   * is dropped below its sockets are terminated by the server and node-postgres
   * emits an 'error' event with no listener — which crashes the process AFTER
   * the check has already passed, turning a green result into a red exit code.
   * The teardown is expected, so it is swallowed here rather than left to kill
   * a successful run.
   */
  process.on('uncaughtException', (err) => {
    if (err instanceof Error && /terminating connection|Connection terminated/i.test(err.message)) return;
    throw err;
  });

  const check = new Client({ connectionString: scratch });
  await check.connect();

  const admins = async () => {
    const r = await check.query<{ n: number }>(`select count(*)::int n from users where role = 'admin'`);
    return r.rows[0]!.n;
  };

  try {
    const first = await install(INPUT);
    if (!first.ok) throw new Error('the first install was refused');
    if ((await admins()) !== 1) throw new Error(`expected 1 admin, found ${await admins()}`);
    if (!first.demo || first.demo.products < 1) throw new Error('demo content was requested but none was created');

    // A second attempt, with a different email — the takeover shape.
    resetInstalledMemo();
    const second = await install({ ...INPUT, email: 'attacker@example.test', name: 'Second' });
    if (second.ok) throw new Error('a SECOND administrator was created — the wizard can be re-run');
    if ((await admins()) !== 1) throw new Error('a second administrator reached the database');

    // Ten at once, from a state that believes setup is pending. This is the
    // race a read-then-write guard loses.
    resetInstalledMemo();
    const racers = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        install({ ...INPUT, email: `race-${i}@example.test`, name: `Race ${i}` })
      )
    );
    const won = racers.filter((r) => r.ok).length;
    if (won !== 0) throw new Error(`${won} concurrent installs succeeded after setup was complete`);
    if ((await admins()) !== 1) throw new Error(`concurrency created extra admins: ${await admins()}`);

    const products = await check.query<{ n: number }>('select count(*)::int n from products');
    console.log(
      `✅ setup runs exactly once — 1 administrator after 12 attempts, ${products.rows[0]!.n} demo products installed`
    );
  } finally {
    await check.end();
    const a = new Client({ connectionString: `${base}/postgres` });
    await a.connect();
    await dropDatabase(a, NAME);
    await a.end();
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('❌ setup guarantee broken:');
  console.error(e);
  process.exit(1);
});
