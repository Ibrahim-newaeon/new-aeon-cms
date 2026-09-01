// e2e/global-setup.ts
import { withDb } from './fixtures';

/**
 * Puts the database into a state the specs can rely on, once per run.
 *
 * Deliberately narrow. It does NOT create the world — the seed does that — it
 * only repairs the things a previous run consumes, so `npm run test:e2e` is
 * repeatable rather than passing once and then failing on stock.
 */
export default async function globalSetup() {
  /**
   * Fresh-install mode.
   *
   * The setup wizard can only be exercised on a database with NO administrator
   * — which is precisely the state every assertion below refuses to start in.
   * Without an escape the wizard's own UI could never be tested against the
   * thing it exists for, and the three behaviours that only live in the form
   * (reveal, confirmation mismatch, country picking its currency) would be
   * verified by hand or not at all.
   *
   * Opt-in and loud: the checks below are the reason `npm run test:e2e` is
   * repeatable, so this must never be the default.
   */
  if (process.env.E2E_FRESH_INSTALL === '1') {
    console.log('[e2e] fresh-install mode — seeded-data checks skipped');
    return;
  }

  await withDb(async (db) => {
    // Checkout decrements stock permanently, so without this the second run of
    // the commerce spec fails on an out-of-stock variant.
    const stock = await db.query(
      `update product_variants set stock = 50 where stock < 20 returning sku`
    );

    // Commerce routes 404 when the module is off, and the holding page swallows
    // the whole site when coming-soon is on. Either would fail every spec with
    // a misleading error.
    await db.query(
      `update settings set ecommerce_enabled = true, coming_soon_mode = false where id = 1`
    );

    // Checkout rejects a governorate with no active zone, so the one the
    // commerce spec selects has to exist.
    const zones = await db.query(
      `select count(*)::int as n from shipping_zones
       where is_active = true and governorates ? 'amman'`
    );
    if (zones.rows[0].n === 0) {
      throw new Error(
        'No active shipping zone covers "amman" — the checkout spec cannot pass. Run npm run db:seed.'
      );
    }

    /**
     * Checkout draws its order number from a sequence created by migration
     * 0006, and `drizzle-kit push` does not run migration SQL. A database built
     * with db:push therefore has no sequence, and every checkout spec failed as
     * a 25-second navigation timeout — the slowest, least informative way to
     * learn that one database object is missing. The seed now creates it; this
     * says so plainly if someone arrives here another way.
     */
    const seq = await db.query(
      `select count(*)::int as n from pg_class where relkind = 'S' and relname = 'order_number_seq'`
    );
    if (seq.rows[0].n === 0) {
      throw new Error(
        'order_number_seq is missing, so checkout cannot allocate an order number. ' +
          'Run npm run db:seed (or npm run db:migrate).'
      );
    }

    const admin = await db.query(`select count(*)::int as n from users where email = $1`, [
      'admin@newaeon.com',
    ]);
    if (admin.rows[0].n === 0) {
      throw new Error('The seeded admin user is missing. Run npm run db:seed.');
    }

    // Every run places a real order, and the app deliberately has no delete for
    // one — cancelling is how an order stops being real. That rule is about the
    // application; a fixture database should not accumulate a shopper called
    // "E2E Shopper" forever, so the harness clears its own leavings here rather
    // than at the end, which also survives a run that crashed halfway.
    const orders = await db.query(
      `delete from orders where customer_name = 'E2E Shopper' returning id`
    );

    // Belt and braces for a crashed run: the specs clean up after themselves,
    // but only if they reach their afterAll.
    await db.query(`delete from content where slug like 'e2e-%'`);
    await db.query(`delete from tags where slug like 'e2e-%'`);

    // The customer row is deliberately left alone. customers.phone is the merge
    // key, so the shopper the suite uses can be the same person as a real
    // earlier order — deleting it violates orders_customer_id_customers_id_fk.
    // Orders snapshot the name and address anyway, so a stale row costs nothing.

    console.log(
      `[e2e] fixtures ready — topped up ${stock.rowCount} variant(s), ` +
        `cleared ${orders.rowCount} order(s) from previous runs, commerce on, zone present`
    );
  });
}
