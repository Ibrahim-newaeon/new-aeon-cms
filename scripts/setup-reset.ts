// scripts/setup-reset.ts
//
// Reopens the first-run wizard on a database you are willing to break.
//
// ── Why this exists ─────────────────────────────────────────────────────────
// The wizard closes itself permanently once an administrator exists. That is
// its security property, and it means the only way to see the thing again is
// to put the database back into a state it is designed never to return to.
// Until now that was done by hand, over `railway ssh`, as a `delete from
// users` typed into a live psql — which is both the most dangerous shape a
// command can have and easy to point at the wrong environment.
//
// ── Why it demotes instead of deleting ──────────────────────────────────────
// Deleting fails anyway: audit_log.user_id, content.author_id,
// media_assets.uploaded_by, order_status_history.changed_by and
// product_reviews.moderated_by all reference users with no ON DELETE rule, so
// a delete either errors — which is exactly what happened the first time this
// was tried — or forces you to null five columns and throw away an audit trail
// to test a form.
//
// needsSetup() and the conditional INSERT in install() both ask the same
// question: does a row with role = 'admin' exist? So changing the role is
// enough, and it is reversible: the account keeps its password, its content
// and its history, and one UPDATE puts it back.
//
// ── Why the confirmation is the site's own name ─────────────────────────────
// A name check on the connection string cannot tell staging from production
// here: both are `postgres.railway.internal`, both are the database called
// `railway`, both run NODE_ENV=production. The only reliable proof that the
// operator knows which database they are pointed at is making them type what
// that database calls itself. Read from settings.site_name, matched exactly.
//
// ── Usage ───────────────────────────────────────────────────────────────────
//   npm run setup:reset                     -- shows the target and refuses
//   npm run setup:reset -- --confirm "Acme" -- demotes, wizard reopens
//   npm run setup:reset -- --restore a@b.c  -- promotes that account back
//
// Against a Railway environment there is no public endpoint, so run it from
// inside: `railway ssh --service Postgres-9DUh --environment staging` and use
// psql with the statement this prints, or run the app service with a shell.
//
// AFTERWARDS: needsSetup() memoises `installed = true` per process and only in
// that direction, so a server that has already answered "an admin exists"
// keeps redirecting /setup to /admin. Restart it — `railway redeploy` — or the
// wizard stays shut on a database that is ready for it.
import { Client } from 'pg';

interface Admin {
  id: string;
  email: string;
  name: string | null;
  is_active: boolean;
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    // Host and database only. The password is in this string and must not be
    // echoed just because someone ran a script with the wrong flag.
    const target = url.replace(/^postgres(ql)?:\/\/[^@]*@/, '');

    const restore = arg('--restore');
    if (restore) {
      const r = await client.query<Admin>(
        `update users set role = 'admin', updated_at = now()
          where lower(email) = lower($1)
        returning id, email, name, is_active`,
        [restore]
      );
      const row = r.rows[0];
      if (!row) throw new Error(`no account with the email ${restore}`);
      console.log(`✅ ${row.email} is an administrator again on ${target}`);
      if (!row.is_active) {
        console.log('⚠️  That account is deactivated, so it still cannot log in.');
      }
      console.log('   Restart the app so it stops offering the wizard.');
      return;
    }

    const settings = await client.query<{ site_name: string | null }>(
      'select site_name from settings limit 1'
    );
    const siteName = settings.rows[0]?.site_name?.trim() || 'unnamed';

    const admins = await client.query<Admin>(
      `select id, email, name, is_active from users where role = 'admin' order by email`
    );

    if (admins.rowCount === 0) {
      console.log(`Nothing to do — ${target} has no administrator, so /setup is already open.`);
      console.log('If it still redirects, the running server is holding a memo. Restart it.');
      return;
    }

    console.log(`Database : ${target}`);
    console.log(`Site name: ${siteName}`);
    console.log(`Administrators that would be demoted to 'editor':`);
    for (const a of admins.rows) {
      console.log(`  · ${a.email}${a.name ? ` (${a.name})` : ''}${a.is_active ? '' : ' [inactive]'}`);
    }

    const confirm = arg('--confirm');
    if (confirm !== siteName) {
      console.log('');
      console.log('Refusing to touch this database.');
      console.log(`To go ahead, name the site you are resetting:`);
      console.log('');
      console.log(`  npm run setup:reset -- --confirm ${JSON.stringify(siteName)}`);
      console.log('');
      console.log('Nobody can log in afterwards until the wizard creates the next owner.');
      process.exitCode = 1;
      return;
    }

    const done = await client.query<Admin>(
      `update users set role = 'editor', updated_at = now()
        where role = 'admin'
      returning id, email, name, is_active`
    );

    console.log('');
    console.log(`✅ ${done.rowCount} administrator(s) demoted on ${target}. /setup will reopen.`);
    console.log('');
    console.log('Restart the app first — needsSetup() caches its answer per process:');
    console.log('   railway redeploy --service <service> --environment <env>   (or restart your dev server)');
    console.log('');
    console.log('To undo, with no data lost:');
    for (const a of done.rows) {
      console.log(`   npm run setup:reset -- --restore ${a.email}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
