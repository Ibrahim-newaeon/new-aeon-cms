// e2e/stock-alerts.spec.ts
import { test, expect } from '@playwright/test';
import { PRODUCT_SLUG, SHOP_LOCALE, withDb } from './fixtures';

/**
 * Back-in-stock notifications.
 *
 * Two promises are under test: the form only appears for something actually out
 * of stock, and the shopper is told exactly once.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('stock alerts', () => {
  test.describe.configure({ mode: 'serial' });

  const email = `waiting-${Date.now()}@example.test`;
  let variantId: string;
  let originalStock: number;
  /** The exact option values of the sold-out variant, e.g. Size=100ml, Cap=Gold. */
  let soldOutOptions: { option: string; value: string }[] = [];

  test.beforeAll(async () => {
    await withDb(async (db) => {
      const rows = await db.query(
        `select v.id, v.stock from product_variants v
           join products p on p.id = v.product_id
          where p.slug = $1 order by v.sku limit 1`,
        [PRODUCT_SLUG]
      );
      variantId = rows.rows[0].id;
      originalStock = rows.rows[0].stock;

      // Which option values identify this variant. Clicking "the first value in
      // each group" is not the same thing — DOM order put 50ml first, which
      // selected a different, in-stock variant and made the test look broken.
      const opts = await db.query(
        `select po.name as option, vov.value from variant_option_values vov
           join product_options po on po.id = vov.option_id
          where vov.variant_id = $1`,
        [variantId]
      );
      soldOutOptions = opts.rows;

      await db.query(`delete from stock_alerts where email = $1`, [email]);
      await db.query(`update product_variants set stock = 0 where id = $1`, [variantId]);
    });
  });

  test.afterAll(async () => {
    await withDb(async (db) => {
      await db.query(`delete from stock_alerts where email = $1`, [email]);
      await db.query(`update product_variants set stock = $1 where id = $2`, [
        originalStock,
        variantId,
      ]);
    });
  });

  test('the form appears only for a variant that has run out', async ({ page }) => {
    await page.goto(`/${SHOP_LOCALE}/products/${PRODUCT_SLUG}`);

    // Select the exact combination that is sold out.
    for (const { option, value } of soldOutOptions) {
      await page.getByTestId(`opt-${option}-${value}`).click();
    }

    await expect(page.getByTestId('stock-alert-form')).toBeVisible();
    // Adding to the cart is not offered for something that does not exist.
    await expect(page.getByTestId('add-to-cart')).toBeDisabled();
  });

  test('a shopper can ask to be told, and asking twice is not an error', async ({
    page,
    baseURL,
  }) => {
    const subscribe = () =>
      page.evaluate(
        async ({ url, payload }) => {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(payload),
          });
          return res.status;
        },
        {
          url: `${baseURL}/api/commerce/stock-alerts`,
          payload: { variantId, email, locale: SHOP_LOCALE },
        }
      );

    await page.goto(`/${SHOP_LOCALE}/products/${PRODUCT_SLUG}`);

    expect(await subscribe()).toBe(200);
    // The intent is already recorded; a second ask is not worth an error.
    expect(await subscribe()).toBe(200);

    const rows = await withDb((db) =>
      db.query(`select count(*)::int as n from stock_alerts where email = $1`, [email])
    );
    expect(rows.rows[0].n).toBe(1);
  });

  test('asking about something already in stock is refused with a reason', async ({
    page,
    baseURL,
  }) => {
    const inStock = await withDb((db) =>
      db.query(`select id from product_variants where stock > 0 limit 1`)
    );
    test.skip(inStock.rows.length === 0, 'no in-stock variant to test against');

    await page.goto(`/${SHOP_LOCALE}/products/${PRODUCT_SLUG}`);

    const result = await page.evaluate(
      async ({ url, payload }) => {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(payload),
        });
        return { status: res.status, body: await res.json() };
      },
      {
        url: `${baseURL}/api/commerce/stock-alerts`,
        payload: { variantId: inStock.rows[0].id, email, locale: SHOP_LOCALE },
      }
    );

    // Better than silently queueing a notification that would fire at once.
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('IN_STOCK');
  });

  test('cancelling an order restocks the variant and notifies exactly once', async ({
    page,
    browser,
    baseURL,
  }) => {
    // Driven through the real path rather than by importing the notifier: that
    // module is `server-only`, and calling it from the test process would prove
    // nothing about whether the order route is actually wired to it.

    // 1. Put stock back briefly so an order can be placed at all.
    await withDb((db) =>
      db.query(`update product_variants set stock = 1 where id = $1`, [variantId])
    );

    const shopper = await browser.newContext();
    const shop = await shopper.newPage();

    await shop.goto(`/${SHOP_LOCALE}/products/${PRODUCT_SLUG}`);
    for (const { option, value } of soldOutOptions) {
      await shop.getByTestId(`opt-${option}-${value}`).click();
    }
    await shop.getByTestId('add-to-cart').click();
    await expect(shop.getByRole('link', { name: /cart/i })).toBeVisible({ timeout: 15_000 });

    await shop.goto(`/${SHOP_LOCALE}/checkout`);
    await shop.getByTestId('checkout-name').fill('Restock Tester');
    await shop.getByTestId('checkout-phone').fill('0791239999');
    await shop.getByTestId('checkout-governorate').selectOption('amman');
    await shop.getByTestId('checkout-city').fill('Amman');
    await shop.getByTestId('checkout-address').fill('Somewhere in Amman 12');
    await shop.getByTestId('checkout-submit').click();
    await shop.waitForURL(/\/order\/ORD-\d+/, { timeout: 25_000 });

    const orderNumber = shop.url().split('/order/')[1]!;
    await shopper.close();

    // 2. Now it is genuinely sold out, and someone asks to be told.
    await withDb((db) =>
      db.query(`update product_variants set stock = 0 where id = $1`, [variantId])
    );

    await page.goto(`/${SHOP_LOCALE}/products/${PRODUCT_SLUG}`);
    const status = await page.evaluate(
      async ({ url, payload }) => {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(payload),
        });
        return res.status;
      },
      {
        url: `${baseURL}/api/commerce/stock-alerts`,
        payload: { variantId, email, locale: SHOP_LOCALE },
      }
    );
    expect(status).toBe(200);

    // 3. Cancelling returns the stock — one of the two places it can rise.
    const admin = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    const adminPage = await admin.newPage();

    const orderId = (await withDb((db) =>
      db.query(`select id from orders where order_number = $1`, [orderNumber])
    )).rows[0].id;

    await adminPage.goto(`/admin/commerce/orders/${orderId}`);
    await adminPage.getByRole('button', { name: /ملغى|Cancelled/ }).click();
    await expect(adminPage.getByText(/هذه حالة نهائية|final status/)).toBeVisible({
      timeout: 15_000,
    });
    await admin.close();

    // The waiting shopper has been told, exactly once.
    await expect
      .poll(async () => {
        const r = await withDb((db) =>
          db.query(`select notified_at from stock_alerts where email = $1`, [email])
        );
        return r.rows[0]?.notified_at !== null;
      }, { timeout: 15_000 })
      .toBe(true);

    const rows = await withDb((db) =>
      db.query(`select count(*)::int as n from stock_alerts where email = $1`, [email])
    );
    expect(rows.rows[0].n).toBe(1);

    await withDb((db) =>
      db.query(`delete from orders where order_number = $1`, [orderNumber])
    );
  });
});
