// scripts/migrate-phones-to-e164.ts
import { db } from '../lib/db';
import { sql } from 'drizzle-orm';
import { normalisePhone, DEFAULT_COUNTRY, isCountryCode } from '../lib/commerce/phone';
import type { CountryCode } from 'libphonenumber-js';

/**
 * Rewrites every stored phone number into E.164.
 *
 * The canonical form was the local Jordanian `0791234567`; it is now
 * `+962791234567`. This value is the merge key for customers and half the
 * one-review-per-person key, so getting it wrong does not throw — it silently
 * splits one person into two, or merges two people into one, and nobody finds
 * out until a customer's order history is wrong.
 *
 * Which is why this runs as ONE transaction across all three tables, refuses to
 * proceed on a collision, and dry-runs by default.
 *
 *   npx tsx --env-file=.env scripts/migrate-phones-to-e164.ts            # report
 *   npx tsx --env-file=.env scripts/migrate-phones-to-e164.ts --apply    # do it
 *
 * Safe to run twice: normalisePhone is idempotent, so a row already in E.164
 * maps to itself.
 */

const APPLY = process.argv.includes('--apply');

const COUNTRY: CountryCode = (() => {
  const flag = process.argv.find((a) => a.startsWith('--country='))?.split('=')[1];
  const code = flag?.toUpperCase();
  return code && isCountryCode(code) ? code : DEFAULT_COUNTRY;
})();

interface Row {
  id: string;
  phone: string;
}

/** What a table's rows would become, plus anything that cannot be converted. */
function plan(rows: Row[], label: string) {
  const changes: { id: string; from: string; to: string }[] = [];
  const unparseable: Row[] = [];

  for (const row of rows) {
    const to = normalisePhone(row.phone, COUNTRY);
    if (!to) {
      unparseable.push(row);
      continue;
    }
    if (to !== row.phone) changes.push({ id: row.id, from: row.phone, to });
  }

  console.log(
    `  ${label}: ${rows.length} rows, ${changes.length} to rewrite, ` +
      `${unparseable.length} unparseable`
  );
  for (const u of unparseable) console.log(`    ! cannot parse ${JSON.stringify(u.phone)} (${u.id})`);
  return { changes, unparseable };
}

/** Two rows landing on one value would violate a unique index — or worse, not. */
function collisions(
  existing: Row[],
  changes: { id: string; from: string; to: string }[],
  keyOf: (row: Row) => string
) {
  const after = new Map<string, string[]>();
  const rewritten = new Map(changes.map((c) => [c.id, c.to]));

  for (const row of existing) {
    const phone = rewritten.get(row.id) ?? row.phone;
    const key = keyOf({ ...row, phone });
    after.set(key, [...(after.get(key) ?? []), row.id]);
  }
  return [...after.entries()].filter(([, ids]) => ids.length > 1);
}

async function main() {
  console.log(`Phone migration to E.164 — country ${COUNTRY}${APPLY ? '' : ' (DRY RUN)'}\n`);

  const customers = (await db.execute(
    sql`select id::text, phone from customers`
  )).rows as unknown as Row[];
  const orders = (await db.execute(
    sql`select id::text, phone from orders`
  )).rows as unknown as Row[];
  const reviews = (await db.execute(
    sql`select id::text, phone, product_id::text as product_id from product_reviews`
  )).rows as unknown as (Row & { product_id: string })[];

  const c = plan(customers, 'customers');
  const o = plan(orders, 'orders');
  const r = plan(reviews, 'product_reviews');

  // customers.phone is UNIQUE; (product_id, phone) is UNIQUE on reviews.
  const customerClashes = collisions(customers, c.changes, (row) => row.phone);
  const reviewClashes = collisions(
    reviews,
    r.changes,
    (row) => `${(row as Row & { product_id: string }).product_id}|${row.phone}`
  );

  if (customerClashes.length || reviewClashes.length) {
    console.error('\nREFUSING TO PROCEED — rows would collide after normalisation:');
    for (const [key, ids] of customerClashes) console.error(`  customers ${key}: ${ids.join(', ')}`);
    for (const [key, ids] of reviewClashes) console.error(`  reviews ${key}: ${ids.join(', ')}`);
    console.error(
      '\nThese are the same person recorded twice. Merge them by hand first —\n' +
        'deciding which order history survives is not a script’s call.'
    );
    process.exit(1);
  }

  const total = c.changes.length + o.changes.length + r.changes.length;
  if (total === 0) {
    console.log('\nNothing to do — every number is already canonical.');
    process.exit(0);
  }

  if (!APPLY) {
    console.log(`\n${total} rows would be rewritten. Re-run with --apply.`);
    for (const ch of [...c.changes, ...o.changes, ...r.changes].slice(0, 10)) {
      console.log(`    ${ch.from}  ->  ${ch.to}`);
    }
    process.exit(0);
  }

  // One transaction across all three tables: a partial migration would leave
  // orders keyed on a number no customer row carries any more.
  await db.transaction(async (tx) => {
    for (const [table, changes] of [
      ['customers', c.changes],
      ['orders', o.changes],
      ['product_reviews', r.changes],
    ] as const) {
      for (const ch of changes) {
        await tx.execute(
          sql`update ${sql.raw(table)} set phone = ${ch.to} where id = ${ch.id}::uuid`
        );
      }
    }
  });

  console.log(`\nDone — ${total} rows rewritten.`);
  process.exit(0);
}

void main();
