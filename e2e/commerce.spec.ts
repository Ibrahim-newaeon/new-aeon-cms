// e2e/commerce.spec.ts
import { test, expect, type Page } from '@playwright/test';
import { ADMIN_PATH, PRODUCT_SLUG, SHOP_LOCALE, withDb } from './fixtures';

/**
 * Picks the first value in every option group, then adds to the cart.
 *
 * The product has Size and Cap, and the button stays disabled until the
 * selection resolves to a real variant — so a test that just clicks "add"
 * fails on a disabled control rather than on anything meaningful. Reading the
 * groups off the page instead of hardcoding "50ml"/"Gold" keeps this working if
 * the seed changes. (Group names must not contain a hyphen; values may.)
 */
async function addFirstVariantToCart(page: Page) {
  const ids = await page
    .locator('[data-test-id^="opt-"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-test-id')!));

  const firstOfEachGroup = new Map<string, string>();
  for (const id of ids) {
    const group = id.split('-')[1]!;
    if (!firstOfEachGroup.has(group)) firstOfEachGroup.set(group, id);
  }
  for (const id of firstOfEachGroup.values()) {
    await page.getByTestId(id).click();
  }

  const button = page.getByTestId('add-to-cart');
  await expect(button).toBeEnabled();
  await button.click();

  // The add is a fetch; navigating before it resolves loses the line entirely.
  // The "view cart" link only appears once the request has succeeded.
  await expect(page.getByRole('link', { name: /السلة|cart/i })).toBeVisible({ timeout: 15_000 });
}

/**
 * Storefront → order → fulfilment.
 *
 * Everything the shop is for, in one path: add to cart, check out, watch stock
 * fall, find the order in the admin, move it through the state machine, and
 * watch the stock come back when it is cancelled.
 *
 * Unit tests cover the state machine exhaustively; what they cannot show is
 * that the cart cookie, the pricing re-read, the order write and the admin
 * screen are wired to each other.
 */
test.describe('commerce', () => {
  test.describe.configure({ mode: 'serial' });

  let orderNumber: string;
  let orderId: string;

  test('a shopper can add to the cart and see it priced', async ({ page }) => {
    await page.goto(`/${SHOP_LOCALE}/products/${PRODUCT_SLUG}`);

    await expect(page.getByTestId('add-to-cart')).toBeVisible();
    await addFirstVariantToCart(page);

    await page.goto(`/${SHOP_LOCALE}/cart`);
    await expect(page.getByTestId('cart-checkout')).toBeVisible();

    // The cookie carries only variant ids and quantities; the money on this
    // page is re-read from the database, so its presence is the real assertion.
    await expect(page.locator('[data-test-id^="cart-line-"]')).toHaveCount(1);
  });

  test('checkout places an order and decrements exactly the right stock', async ({ page }) => {
    await page.goto(`/${SHOP_LOCALE}/products/${PRODUCT_SLUG}`);
    await addFirstVariantToCart(page);

    await page.goto(`/${SHOP_LOCALE}/checkout`);
    await expect(page.getByTestId('checkout-form')).toBeVisible();

    const before = await withDb((db) =>
      db.query(`select sku, stock from product_variants order by sku`)
    );

    await page.getByTestId('checkout-name').fill('E2E Shopper');
    await page.getByTestId('checkout-phone').fill('0791234567');
    await page.getByTestId('checkout-governorate').selectOption('amman');
    await page.getByTestId('checkout-city').fill('Amman');
    await page.getByTestId('checkout-address').fill('Rainbow Street, building 12');
    await page.getByTestId('checkout-submit').click();

    // Success is a redirect to the order page, which carries the number.
    await page.waitForURL(/\/order\/ORD-\d+/, { timeout: 25_000 });
    orderNumber = page.url().split('/order/')[1]!;
    expect(orderNumber).toMatch(/^ORD-\d+$/);

    const order = await withDb((db) =>
      db.query(
        `select o.id, o.total, o.status, i.variant_id, i.qty
           from orders o join order_items i on i.order_id = o.id
          where o.order_number = $1`,
        [orderNumber]
      )
    );
    expect(order.rows.length).toBeGreaterThan(0);
    orderId = order.rows[0].id;
    expect(order.rows[0].status).toBe('pending');

    const after = await withDb((db) =>
      db.query(`select sku, stock from product_variants order by sku`)
    );

    // Exactly the purchased line moved, by exactly the purchased quantity.
    const boughtQty = Number(order.rows[0].qty);
    const changed = before.rows
      .map((b, i) => ({ sku: b.sku, delta: Number(b.stock) - Number(after.rows[i].stock) }))
      .filter((r) => r.delta !== 0);

    expect(changed).toHaveLength(1);
    expect(changed[0]!.delta).toBe(boughtQty);
  });

  test('the order appears in the admin list and can be found by search', async ({ page }) => {
    await page.goto(`${ADMIN_PATH}/commerce/orders`);

    await expect(page.getByRole('link', { name: orderNumber })).toBeVisible();

    await page.getByPlaceholder(/ابحث|Search/).fill(orderNumber);
    await page.keyboard.press('Enter');

    await page.waitForURL(/[?&]q=/, { timeout: 15_000 });
    await expect(page.getByRole('link', { name: orderNumber })).toBeVisible();
  });

  test('an illegal status transition is refused by the API, not just hidden', async ({ page }) => {
    // Issued from inside the page with fetch, so it carries the session exactly
    // as the admin's own browser would. Playwright's `request` fixtures are
    // separate contexts here and answer 401, which would prove nothing about
    // the state machine.
    //
    // The detail screen only offers legal moves; this posts past the UI to show
    // the route itself enforces them.
    await page.goto(`${ADMIN_PATH}/commerce/orders/${orderId}`);

    const result = await page.evaluate(async (id) => {
      const res = await fetch(`/api/commerce/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'status', status: 'delivered' }),
      });
      return { status: res.status, body: await res.json() };
    }, orderId);

    expect(result.status).toBe(409);
    expect(result.body.error.message).toBeTruthy();
  });

  test('an admin can move the order forward through its legal states', async ({ page }) => {
    await page.goto(`${ADMIN_PATH}/commerce/orders/${orderId}`);

    await expect(page.getByRole('heading', { name: orderNumber })).toBeVisible();

    // pending -> confirmed is offered; delivered is not.
    await page.getByRole('button', { name: /مؤكّد|Confirmed/ }).click();

    await expect(page.getByRole('button', { name: /قيد التجهيز|Processing/ })).toBeVisible({
      timeout: 15_000,
    });

    const status = await withDb((db) =>
      db.query(`select status from orders where id = $1`, [orderId])
    );
    expect(status.rows[0].status).toBe('confirmed');

    const history = await withDb((db) =>
      db.query(
        `select from_status, to_status, changed_by from order_status_history
          where order_id = $1 order by created_at`,
        [orderId]
      )
    );
    // Placement plus the transition, and the admin move records who did it.
    expect(history.rows.length).toBeGreaterThanOrEqual(2);
    const last = history.rows[history.rows.length - 1];
    expect(last.from_status).toBe('pending');
    expect(last.to_status).toBe('confirmed');
    expect(last.changed_by).not.toBeNull();
  });

  test('cancelling returns the stock', async ({ page }) => {
    const before = await withDb((db) =>
      db.query(
        `select v.id, v.stock, i.qty from product_variants v
           join order_items i on i.variant_id = v.id
          where i.order_id = $1`,
        [orderId]
      )
    );

    await page.goto(`${ADMIN_PATH}/commerce/orders/${orderId}`);
    await page.getByRole('button', { name: /ملغى|Cancelled/ }).click();

    await expect(page.getByText(/هذه حالة نهائية|final status/)).toBeVisible({ timeout: 15_000 });

    const after = await withDb((db) =>
      db.query(`select id, stock from product_variants where id = any($1::uuid[])`, [
        before.rows.map((r) => r.id),
      ])
    );

    for (const row of before.rows) {
      const now = after.rows.find((r) => r.id === row.id)!;
      expect(Number(now.stock) - Number(row.stock)).toBe(Number(row.qty));
    }
  });
});
