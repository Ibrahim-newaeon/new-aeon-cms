// e2e/customers.spec.ts
import { test, expect } from '@playwright/test';
import { ADMIN_PATH, withDb } from './fixtures';
import { normalisePhone } from '../lib/commerce/phone';

/**
 * The customer list and the commerce dashboard tiles.
 *
 * Both read data the shop was already collecting and never showed: the
 * customers table has been written by every checkout since C2, and
 * lowStockThreshold has sat on every variant unread since C1.
 */
test.describe('customers', () => {
  test('the list shows customers created by checkout', async ({ page }) => {
    const count = await withDb(async (db) => {
      const r = await db.query('select count(*)::int as n from customers');
      return r.rows[0].n as number;
    });
    test.skip(count === 0, 'no customers in this database');

    await page.goto(`${ADMIN_PATH}/commerce/customers`);
    await expect(page.getByTestId('customers-table')).toBeVisible();
    expect(await page.getByTestId('customer-link').count()).toBeGreaterThan(0);
  });

  test('searching a local phone finds the customer stored as E.164', async ({ page }) => {
    /**
     * The one search a shop actually performs: someone reads a number off an
     * invoice as 07…, but it is stored as +962…. A plain LIKE would match
     * nothing, which looks exactly like "this customer does not exist".
     */
    const stored = await withDb(async (db) => {
      const r = await db.query('select phone from customers limit 1');
      return r.rows[0]?.phone as string | undefined;
    });
    test.skip(!stored, 'no customers in this database');

    const local = stored!.replace(/^\+962/, '0');
    expect(normalisePhone(local)).toBe(stored);

    await page.goto(`${ADMIN_PATH}/commerce/customers?q=${encodeURIComponent(local)}`);
    await expect(page.getByTestId('customer-link')).toHaveCount(1);
  });

  test('a customer page lists that customer’s orders', async ({ page }) => {
    /**
     * Seeds its own customer and order rather than hoping one survives: the
     * shared fixtures clear orders between runs, so relying on found data made
     * this skip silently — a test that never runs is not coverage.
     */
    const phone = normalisePhone('0799' + String(Date.now()).slice(-6));
    const seeded = await withDb(async (db) => {
      const c = await db.query(
        `insert into customers (phone, name) values ($1, 'E2E History') returning id`,
        [phone]
      );
      const customerId = c.rows[0].id as string;
      const o = await db.query(
        // order_number has no default; it comes from the sequence the schema
        // declares, the same one checkout uses.
        `insert into orders (order_number, customer_id, status, subtotal, shipping, discount,
                             total, customer_name, phone, governorate, city, address_line)
         values ('E2E-' || nextval('order_number_seq'), $1, 'delivered', 1000, 0, 0, 1000,
                 'E2E History', $2, 'amman', 'Amman', 'Test address 1')
         returning id, order_number`,
        [customerId, phone]
      );
      return { customerId, orderNumber: o.rows[0].order_number as string };
    });

    try {
      await page.goto(`${ADMIN_PATH}/commerce/customers/${seeded.customerId}`);
      await expect(page.getByTestId('customer-orders')).toBeVisible();
      await expect(page.getByTestId('customer-orders')).toContainText(seeded.orderNumber);
    } finally {
      await withDb(async (db) => {
        await db.query('delete from orders where customer_id = $1', [seeded.customerId]);
        await db.query('delete from customers where id = $1', [seeded.customerId]);
      });
    }
  });
});

test.describe('commerce dashboard', () => {
  test('the dashboard shows shop tiles when commerce is on', async ({ page }) => {
    await page.goto(ADMIN_PATH);
    await expect(page.getByTestId('commerce-stats')).toBeVisible();
  });

  test('low stock appears only when a variant is at or below ITS threshold', async ({ page }) => {
    // Per-variant, not one global number — that is what the column means, and
    // it had never been read anywhere in the panel.
    const variant = await withDb(async (db) => {
      const r = await db.query(
        `select sku, stock, low_stock_threshold from product_variants
         where is_active order by sku limit 1`
      );
      return r.rows[0] as { sku: string; stock: number; low_stock_threshold: number };
    });

    await page.goto(ADMIN_PATH);
    const before = await page.getByTestId('low-stock').count();

    await withDb((db) =>
      db.query('update product_variants set stock = 0 where sku = $1', [variant.sku])
    );
    try {
      await page.goto(ADMIN_PATH);
      await expect(page.getByTestId('low-stock')).toBeVisible();
      await expect(page.getByTestId('low-stock')).toContainText(variant.sku);
    } finally {
      await withDb((db) =>
        db.query('update product_variants set stock = $1 where sku = $2', [
          variant.stock,
          variant.sku,
        ])
      );
    }

    await page.goto(ADMIN_PATH);
    expect(await page.getByTestId('low-stock').count()).toBe(before);
  });
});
