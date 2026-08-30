// e2e/account.spec.ts
import { test, expect } from '@playwright/test';
import { withDb, uniqueSlug } from './fixtures';
import { normalisePhone } from '../lib/commerce/phone';
import { hashPassword } from '../lib/auth/password';
import { createCustomerToken } from '../lib/auth/customer-session';

/**
 * Shopper accounts.
 *
 * Signed out for every test in here — the shared admin storage state would
 * otherwise mask exactly the boundary these tests exist to check.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const CODE = '424242';

test.describe('shopper accounts', () => {
  test.describe.configure({ mode: 'serial' });
  // Own client IP: code requests are rate limited per client, and every
  // browser test otherwise shares one address.
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.41' } });

  const phone = normalisePhone('0799' + String(Date.now()).slice(-6));
  let customerId: string;

  test.beforeAll(async () => {
    customerId = await withDb(async (db) => {
      const r = await db.query(
        `insert into customers (phone, name) values ($1, 'E2E Account') returning id`,
        [phone]
      );
      const id = r.rows[0].id as string;
      await db.query(
        `insert into orders (order_number, customer_id, status, subtotal, shipping, discount,
                             total, customer_name, phone, governorate, city, address_line)
         values ('E2E-ACC-' || nextval('order_number_seq'), $1, 'delivered', 2500, 0, 0, 2500,
                 'E2E Account', $2, 'amman', 'Amman', 'Test address 2')`,
        [id, phone]
      );
      return id;
    });
  });

  test.afterAll(async () => {
    await withDb(async (db) => {
      await db.query('delete from customer_otp where phone = $1', [phone]);
      await db.query('delete from orders where customer_id = $1', [customerId]);
      await db.query('delete from customers where id = $1', [customerId]);
    });
  });

  test('a signed-out visitor gets the sign-in form', async ({ page }) => {
    await page.goto('/en/account');
    await expect(page.getByTestId('account-auth')).toBeVisible();
    await expect(page.getByTestId('account-page')).toHaveCount(0);
  });

  test('an unknown number gets a code, worded exactly like a known one', async ({ page }) => {
    /**
     * Accounts are no longer limited to people who have already ordered, and
     * the screen must not betray which case this is — the same notice appears
     * either way, and only a verified code reveals anything.
     */
    await page.goto('/en/account');
    await page.getByTestId('account-phone').fill('0770000009');
    await page.getByTestId('account-send-code').click();

    await expect(page.getByTestId('account-code')).toBeVisible();
    await expect(page.getByTestId('account-notice')).toContainText('a code is on its way');
  });

  test('a wrong code is refused and costs an attempt', async ({ page }) => {
    // Seeded directly: the real code only exists in an SMS, and the point here
    // is the verification path, not the delivery.
    await withDb(async (db) =>
      db.query(
        `insert into customer_otp (phone, code_hash, expires_at, attempts_left)
         values ($1, $2, now() + interval '10 minutes', 5)
         on conflict (phone) do update set code_hash = excluded.code_hash,
           expires_at = excluded.expires_at, attempts_left = 5`,
        [phone, await hashPassword(CODE)]
      )
    );

    await page.goto('/en/account');
    await page.getByTestId('account-phone').fill(phone);
    await page.getByTestId('account-send-code').click();
    await expect(page.getByTestId('account-code')).toBeVisible();

    // Re-seed: requesting through the UI replaced the code with a real one.
    await withDb(async (db) =>
      db.query(
        `update customer_otp set code_hash = $2, attempts_left = 5 where phone = $1`,
        [phone, await hashPassword(CODE)]
      )
    );

    await page.getByTestId('account-code').fill('000000');
    await page.getByTestId('account-verify').click();
    await expect(page.getByTestId('account-error')).toBeVisible();

    const left = await withDb(async (db) => {
      const r = await db.query('select attempts_left from customer_otp where phone = $1', [phone]);
      return r.rows[0]?.attempts_left as number;
    });
    expect(left).toBe(4);
  });

  test('the right code signs in and shows that shopper’s orders', async ({ page }) => {
    await withDb(async (db) =>
      db.query(
        `update customer_otp set code_hash = $2, attempts_left = 5,
           expires_at = now() + interval '10 minutes' where phone = $1`,
        [phone, await hashPassword(CODE)]
      )
    );

    await page.goto('/en/account');
    await page.getByTestId('account-phone').fill(phone);
    await page.getByTestId('account-send-code').click();

    // Wait for the UI's OWN code request to finish before re-seeding, or it
    // lands after and overwrites the known code with a real one — the test
    // then types a code that is no longer current and reads as a product bug.
    await expect(page.getByTestId('account-code')).toBeVisible();

    await withDb(async (db) =>
      db.query(`update customer_otp set code_hash = $2, attempts_left = 5 where phone = $1`, [
        phone,
        await hashPassword(CODE),
      ])
    );

    await page.getByTestId('account-code').fill(CODE);
    await page.getByTestId('account-verify').click();

    /**
     * Where they LAND depends on whether they have a password yet — that
     * branch is covered in customer-accounts.spec.ts. What this test is about
     * is that the code signed them in and their own orders are there, so it
     * goes to the account page and asserts that.
     */
    await expect(page.getByTestId('account-auth')).toHaveCount(0);
    await page.goto('/en/account');
    await expect(page.getByTestId('account-page')).toBeVisible();
    await expect(page.getByTestId('account-orders')).toContainText('E2E-ACC-');

    // Single use: the code is spent even though the session was kept.
    const remaining = await withDb(async (db) => {
      const r = await db.query('select count(*)::int as n from customer_otp where phone = $1', [phone]);
      return r.rows[0].n as number;
    });
    expect(remaining).toBe(0);

    await page.getByTestId('account-signout').click();
    await expect(page.getByTestId('account-auth')).toBeVisible();
  });

  test('a shopper session cannot reach the admin', async ({ page, context }) => {
    /**
     * The one that matters. Both tokens are signed with the same secret, so
     * without the audience claim a customer's session is
     * cryptographically indistinguishable from a staff session.
     */
    const token = await createCustomerToken(customerId, phone);

    /**
     * The URL matters. The suite runs against 127.0.0.1, and a cookie set for
     * `localhost` is simply never sent — the test would then pass because no
     * token was presented at all, proving nothing. Deriving the origin from
     * the page is what keeps this test honest.
     */
    await page.goto('/en');
    const origin = new URL(page.url()).origin;
    await context.addCookies([
      { name: 'customer_session', value: token, url: origin },
      // Presented as an admin cookie too, which is the actual attack.
      { name: 'access_token', value: token, url: origin },
    ]);

    // Proves the cookie really is being sent before anything is asserted on it.
    const sent = await page.context().cookies(origin);
    expect(sent.map((c) => c.name)).toContain('access_token');

    /**
     * Asserted on the landing URL, not the status: page.goto FOLLOWS the
     * redirect, so a bounced request still reports 200 — the 200 of the login
     * page. Checking the status here would pass whether or not the guard
     * worked, which is the worst kind of security test.
     */
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);

    /**
     * Driven from the page so the browser sends real same-origin headers.
     * A bare request context trips the CSRF check first and returns 403,
     * which would pass this test without ever exercising the auth boundary —
     * the thing it exists to prove.
     */
    const status = await page.evaluate(async (slug) => {
      const res = await fetch('/api/content-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ slug, name: 'Evil' }),
      });
      return res.status;
    }, uniqueSlug('evil'));

    // 401: the token was rejected as a session, not merely as a cross-site post.
    expect(status).toBe(401);
  });
});
