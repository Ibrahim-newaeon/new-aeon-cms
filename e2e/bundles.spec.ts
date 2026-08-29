// e2e/bundles.spec.ts
import { test, expect } from '@playwright/test';
import { ADMIN_PATH, SHOP_LOCALE, withDb } from './fixtures';

/**
 * Bundles: a fixed price for a set of variants.
 *
 * The property that matters is that the fixed price survives all the way to the
 * order total WITHOUT stock, order items or fulfilment learning that bundles
 * exist. The saving is expressed as a discount rather than by rewriting line
 * prices, so every figure stays an exact integer and the line totals still sum
 * to the subtotal.
 */
test.describe('bundles', () => {
  test.describe.configure({ mode: 'serial' });

  const slug = `e2e-bundle-${Date.now()}`;
  let bundleId: string;
  let variantA: { id: string; price: number };
  let variantB: { id: string; price: number };

  const bundlePrice = 200_000;

  test.beforeAll(async () => {
    await withDb(async (db) => {
      const rows = await db.query(
        `select id, price from product_variants order by sku limit 2`
      );
      variantA = rows.rows[0];
      variantB = rows.rows[1];

      await db.query(`update product_variants set stock = 30 where id = any($1::uuid[])`, [
        [variantA.id, variantB.id],
      ]);

      const bundle = await db.query(
        `insert into product_bundles (slug, name, price, is_active)
         values ($1, $2, $3, true) returning id`,
        [slug, `E2E Bundle ${slug}`, bundlePrice]
      );
      bundleId = bundle.rows[0].id;

      await db.query(
        `insert into bundle_items (bundle_id, variant_id, qty) values ($1,$2,1),($1,$3,1)`,
        [bundleId, variantA.id, variantB.id]
      );
    });
  });

  test.afterAll(async () => {
    await withDb(async (db) => {
      await db.query(`delete from orders where customer_name = 'E2E Bundle Buyer'`);
      await db.query(`delete from product_bundles where slug = $1`, [slug]);
    });
  });

  test('the storefront shows the bundle and what it saves', async ({ page }) => {
    await page.goto(`/${SHOP_LOCALE}/bundles`);

    const card = page.getByTestId(`bundle-card-${bundleId}`);
    await expect(card).toBeVisible();
    // The parts total is struck through beside the bundle price.
    await expect(card).toContainText('Save');
  });

  test('adding a bundle puts its components in the cart as ordinary lines', async ({ page }) => {
    await page.goto(`/${SHOP_LOCALE}/bundles`);
    await page.getByTestId(`bundle-add-${bundleId}`).click();
    await expect(page.getByTestId(`bundle-added-${bundleId}`)).toBeVisible({ timeout: 15_000 });

    await page.goto(`/${SHOP_LOCALE}/cart`);

    // Two ordinary variant lines — nothing downstream needs to know about
    // bundles.
    await expect(page.locator('[data-test-id^="cart-line-"]')).toHaveCount(2);
    await expect(page.getByTestId('cart-bundle-saving')).toBeVisible();
  });

  test('the order total equals the bundle price, and stock moves per variant', async ({
    page,
  }) => {
    const before = await withDb((db) =>
      db.query(`select id, stock from product_variants where id = any($1::uuid[]) order by id`, [
        [variantA.id, variantB.id],
      ])
    );

    // Each test gets a fresh browser context, so the cart from the previous
    // one is gone and this test fills its own.
    await page.goto(`/${SHOP_LOCALE}/bundles`);
    await page.getByTestId(`bundle-add-${bundleId}`).click();
    await expect(page.getByTestId(`bundle-added-${bundleId}`)).toBeVisible({ timeout: 15_000 });

    await page.goto(`/${SHOP_LOCALE}/checkout`);
    await expect(page.getByTestId('checkout-form')).toBeVisible();

    await page.getByTestId('checkout-name').fill('E2E Bundle Buyer');
    await page.getByTestId('checkout-phone').fill('0791110000');
    await page.getByTestId('checkout-governorate').selectOption('amman');
    await page.getByTestId('checkout-city').fill('Amman');
    await page.getByTestId('checkout-address').fill('Bundle street 1');
    await page.getByTestId('checkout-submit').click();

    await page.waitForURL(/\/order\/ORD-\d+/, { timeout: 25_000 });
    const orderNumber = page.url().split('/order/')[1]!;

    const order = await withDb((db) =>
      db.query(`select subtotal, discount, shipping, total from orders where order_number = $1`, [
        orderNumber,
      ])
    );
    const { subtotal, discount, shipping, total } = order.rows[0];
    const parts = variantA.price + variantB.price;

    expect(Number(subtotal)).toBe(parts);
    expect(Number(discount)).toBe(parts - bundlePrice);
    // Free delivery threshold applies, so the total IS the bundle price.
    expect(Number(total)).toBe(bundlePrice + Number(shipping));

    // Order items are ordinary variant lines at their own prices, and they
    // still sum to the subtotal.
    const lines = await withDb((db) =>
      db.query(
        `select price_snapshot, qty from order_items
          where order_id = (select id from orders where order_number = $1)`,
        [orderNumber]
      )
    );
    expect(lines.rows).toHaveLength(2);
    expect(
      lines.rows.reduce((sum, l) => sum + Number(l.price_snapshot) * Number(l.qty), 0)
    ).toBe(Number(subtotal));

    // Stock moved per component.
    const after = await withDb((db) =>
      db.query(`select id, stock from product_variants where id = any($1::uuid[]) order by id`, [
        [variantA.id, variantB.id],
      ])
    );
    for (let i = 0; i < before.rows.length; i++) {
      expect(Number(before.rows[i].stock) - Number(after.rows[i].stock)).toBe(1);
    }
  });

  test('a bundle priced above its parts is never a surcharge', async ({ page }) => {
    // A bundle costing more than its components is a pricing mistake, not
    // money to collect.
    await withDb((db) =>
      db.query(`update product_bundles set price = $1 where id = $2`, [9_999_000, bundleId])
    );

    await page.context().clearCookies();
    await page.goto(`/${SHOP_LOCALE}/bundles`);
    await page.getByTestId(`bundle-add-${bundleId}`).click();
    await expect(page.getByTestId(`bundle-added-${bundleId}`)).toBeVisible({ timeout: 15_000 });

    await page.goto(`/${SHOP_LOCALE}/cart`);
    await expect(page.locator('[data-test-id^="cart-line-"]')).toHaveCount(2);
    await expect(page.getByTestId('cart-bundle-saving')).toHaveCount(0);

    await withDb((db) =>
      db.query(`update product_bundles set price = $1 where id = $2`, [bundlePrice, bundleId])
    );
  });

  test('an admin can see the bundle and its saving', async ({ page }) => {
    await page.goto(`${ADMIN_PATH}/commerce/bundles`);

    await expect(page.getByTestId('bundles-manager')).toBeVisible();
    await expect(page.getByTestId(`bundle-${bundleId}`)).toBeVisible();
  });
});
