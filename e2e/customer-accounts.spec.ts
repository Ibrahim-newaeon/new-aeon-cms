// e2e/customer-accounts.spec.ts
import { test, expect } from '@playwright/test';
import { withDb } from './fixtures';
import { normalisePhone } from '../lib/commerce/phone';
import { hashPassword } from '../lib/auth/password';

/**
 * Customer accounts — the shopper's own login, as distinct from the admin's
 * staff-only Customers list.
 *
 * Signed out throughout: the shared admin storage state would mask the
 * boundaries these tests exist to check.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const PASSWORD = 'correct horse battery';
const CODE = '424242';

const seedCode = (phone: string) =>
  withDb(async (db) =>
    db.query(
      `insert into customer_otp (phone, code_hash, expires_at, attempts_left)
       values ($1, $2, now() + interval '10 minutes', 5)
       on conflict (phone) do update set code_hash = excluded.code_hash,
         expires_at = excluded.expires_at, attempts_left = 5`,
      [phone, await hashPassword(CODE)]
    )
  );

test.describe('registering', () => {
  test.describe.configure({ mode: 'serial' });
  /**
   * Its own client IP. Sending a code is rate limited per client — correctly,
   * since each one costs money and reaches somebody's phone — and every
   * browser test otherwise shares 127.0.0.1, so one spec's codes exhaust
   * another's budget and the failure looks like a broken form.
   */
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.31' } });

  const phone = normalisePhone('0788' + String(Date.now()).slice(-6));

  test.afterAll(async () => {
    await withDb(async (db) => {
      await db.query('delete from customer_otp where phone = $1', [phone]);
      await db.query('delete from customers where phone = $1', [phone]);
    });
  });

  test('a brand-new number can open an account, via a code', async ({ page }) => {
    // Accounts are not limited to people who have already ordered — and every
    // registration goes through a code, so nothing before that point has to
    // reveal whether the number is known.
    await page.goto('/en/account');
    await page.getByTestId('account-phone').fill(phone);
    await page.getByTestId('account-send-code').click();

    await expect(page.getByTestId('account-code')).toBeVisible();
    await seedCode(phone);

    await page.getByTestId('account-code').fill(CODE);
    await page.getByTestId('account-verify').click();

    await expect(page.getByTestId('account-name')).toBeVisible();
    await page.getByTestId('account-name').fill('New Shopper');
    await page.getByTestId('account-new-password').fill(PASSWORD);
    await page.getByTestId('account-create').click();

    await expect(page.getByTestId('account-page')).toBeVisible();
    await expect(page.getByTestId('account-nav')).toBeVisible();
  });

  test('the password set at registration signs them back in', async ({ page }) => {
    // A fresh context, so this genuinely starts signed out — Playwright does
    // not carry cookies between tests even in serial mode, and relying on the
    // previous test's session would have made this pass without signing in.
    await page.goto('/en/account');
    await expect(page.getByTestId('account-auth')).toBeVisible();

    // Straight in with the password — no SMS for a returning shopper, which is
    // what the password path is for.
    await page.getByTestId('account-phone').fill(phone);
    await page.getByTestId('account-password').fill(PASSWORD);
    await page.getByTestId('account-signin').click();

    await expect(page.getByTestId('account-page')).toBeVisible();

    await page.getByTestId('account-signout').click();
    await expect(page.getByTestId('account-auth')).toBeVisible();
  });
});

test.describe('claiming a number that already has orders', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.32' } });

  const phone = normalisePhone('0787' + String(Date.now()).slice(-6));

  test.beforeAll(async () => {
    // A buyer the shop already knows, with no account.
    await withDb((db) =>
      db.query(`insert into customers (phone, name) values ($1, 'Existing Buyer')`, [phone])
    );
  });

  test.afterAll(async () => {
    await withDb(async (db) => {
      await db.query('delete from customer_otp where phone = $1', [phone]);
      await db.query('delete from customers where phone = $1', [phone]);
    });
  });

  test('the API refuses to register against it without proof', async ({ request }) => {
    /**
     * The security core. That row carries somebody's name, address and order
     * history; handing it over on a claim would be the whole vulnerability.
     */
    const res = await request.post('/api/account/register', {
      data: { phone, name: 'Impostor', password: PASSWORD },
      headers: { origin: new URL(test.info().project.use.baseURL!).origin },
    });
    expect(res.status()).toBe(400);

    // Nothing was created.
    const claimed = await withDb(async (db) => {
      const r = await db.query('select password_hash from customers where phone = $1', [phone]);
      return Boolean(r.rows[0]?.password_hash);
    });
    expect(claimed).toBe(false);
  });

  test('a proof for a DIFFERENT number does not unlock it', async ({ page, request }) => {
    // Otherwise a valid proof for any number unlocks every number.
    const other = normalisePhone('0786' + String(Date.now()).slice(-6));
    await seedCode(other);

    await page.goto('/en/account');
    const proof = await page.evaluate(
      async ([p, c]) => {
        const res = await fetch('/api/account/verify-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ phone: p, code: c }),
        });
        return (await res.json())?.data?.phoneProof ?? null;
      },
      [other, CODE]
    );
    expect(proof).toBeTruthy();

    const res = await request.post('/api/account/register', {
      data: { phone, name: 'Impostor', password: PASSWORD, phoneProof: proof },
      headers: { origin: new URL(test.info().project.use.baseURL!).origin },
    });
    expect(res.status()).toBe(400);

    await withDb((db) => db.query('delete from customer_otp where phone = $1', [other]));
  });

  test('proving the number signs the real owner in, and offers a password', async ({ page }) => {
    await page.goto('/en/account');
    await page.getByTestId('account-phone').fill(phone);
    await page.getByTestId('account-send-code').click();

    await expect(page.getByTestId('account-code')).toBeVisible();
    await seedCode(phone);

    await page.getByTestId('account-code').fill(CODE);
    await page.getByTestId('account-verify').click();

    /**
     * The code proved the number, so they are in — but they still have no
     * password, and without being sent to set one the only way back would be
     * another code every time.
     */
    await expect(page).toHaveURL(/\/account\/profile/);
    await page.getByTestId('profile-password').fill(PASSWORD);
    await page.getByTestId('profile-save').click();
    await expect(page.getByTestId('profile-saved')).toBeVisible();

    const hasPassword = await withDb(async (db) => {
      const r = await db.query('select password_hash from customers where phone = $1', [phone]);
      return Boolean(r.rows[0]?.password_hash);
    });
    expect(hasPassword).toBe(true);
  });
});

test.describe('an account holds', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.33' } });

  const phone = normalisePhone('0785' + String(Date.now()).slice(-6));

  test.beforeAll(async () => {
    await withDb(async (db) =>
      db.query(
        `insert into customers (phone, name, password_hash, registered_at)
         values ($1, 'Book Keeper', $2, now())`,
        [phone, await hashPassword(PASSWORD)]
      )
    );
  });

  test.afterAll(async () => {
    await withDb((db) => db.query('delete from customers where phone = $1', [phone]));
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/en/account');
    if (await page.getByTestId('account-auth').isVisible().catch(() => false)) {
      await page.getByTestId('account-phone').fill(phone);
      await page.getByTestId('account-password').fill(PASSWORD);
      await page.getByTestId('account-signin').click();
      await expect(page.getByTestId('account-page')).toBeVisible();
    }
  });

  test('a saved address, and the first one is the default', async ({ page }) => {
    await page.goto('/en/account/addresses');
    await page.getByTestId('address-name').fill('Book Keeper');
    await page.getByTestId('address-phone').fill(phone);
    await page.getByTestId('address-governorate').selectOption('amman');
    await page.getByTestId('address-city').fill('Amman');
    await page.getByTestId('address-line').fill('Rainbow Street 12');
    await page.getByTestId('address-save').click();

    await expect(page.getByTestId('address-row')).toHaveCount(1);
    // Default without ticking the box: there is nothing else it could be.
    await expect(page.getByTestId('address-default')).toBeVisible();
  });

  test('that address prefills checkout', async ({ page }) => {
    // The reason the address book exists: not retyping it every order.
    // Checkout needs something IN the cart, or it renders an empty-cart page
    // with no form to prefill.
    // Seeded through the cart API rather than the product page: which variant
    // a product needs is not the subject here, and an empty cart renders a
    // page with no form at all.
    await page.goto('/en/shop');
    const variantId = await withDb(async (db) => {
      const r = await db.query(
        `select id from product_variants where is_active and stock > 0 order by sku limit 1`
      );
      return r.rows[0].id as string;
    });
    await page.evaluate(
      async (id) => {
        await fetch('/api/commerce/cart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ action: 'add', variantId: id, qty: 1 }),
        });
      },
      variantId
    );

    await page.goto('/en/checkout');
    await expect(page.getByTestId('checkout-city')).toHaveValue('Amman');
    await expect(page.getByTestId('checkout-address')).toHaveValue('Rainbow Street 12');
    await expect(page.getByTestId('checkout-address')).toBeEditable();
  });

  test('a saved product, which the wishlist then lists', async ({ page }) => {
    await page.goto('/en/shop');
    await page.locator('a[href^="/en/products/"]').first().click();
    // Wait for the click to land. Querying before it does reports zero of
    // everything, which reads as "the control is missing" rather than "the
    // page has not arrived".
    await page.waitForURL(/\/en\/products\//);

    /**
     * The button and the action beside it are both inline-flex and once sat on
     * the same line, overlapping. If they overlap again a click lands on the
     * wrong control, so this asserts they are actually separated.
     *
     * Which action sits there depends on configuration — WhatsApp when the
     * shop has a number, the contact form otherwise — so it is located by
     * test id rather than by label.
     */
    const save = page.getByTestId('wishlist-toggle');
    const whatsapp = page.getByTestId('product-whatsapp');
    const enquire = page.getByTestId('product-enquire');
    const sibling = (await whatsapp.count()) > 0 ? whatsapp : enquire;

    const [a, b] = [await save.boundingBox(), await sibling.boundingBox()];
    expect(a!.x + a!.width).toBeLessThanOrEqual(b!.x + 1);

    await save.click();
    await expect(save).toHaveAttribute('aria-pressed', 'true');

    // Reachable in one click from anywhere, not only from inside the account.
    await page.getByTestId('navbar-wishlist').click();
    await expect(page).toHaveURL(/\/account\/wishlist/);
    await expect(page.getByTestId('wishlist-items').locator('li')).toHaveCount(1);

    await page.getByTestId('wishlist-remove').click();
    await expect(page.getByTestId('wishlist-empty')).toBeVisible();
  });

  test('editable details, but the phone is fixed', async ({ page }) => {
    await page.goto('/en/account/profile');
    await page.getByTestId('profile-name').fill('Renamed Keeper');
    await page.getByTestId('profile-save').click();
    await expect(page.getByTestId('profile-saved')).toBeVisible();

    // The phone is the identity this session proves and the key orders hang
    // off; changing it is the register flow, not a text field.
    await expect(page.getByTestId('profile-phone')).toHaveAttribute('readonly', '');
  });
});

test.describe('order privacy', () => {
  test('an order number alone does not open an order', async ({ page }) => {
    /**
     * Numbers come from a sequence — ORD-1048, ORD-1049 — so this page used to
     * hand anyone counting upward every customer's name, phone and address.
     */
    const order = await withDb(async (db) => {
      const r = await db.query('select order_number, phone from orders limit 1');
      return r.rows[0] as { order_number: string; phone: string } | undefined;
    });
    test.skip(!order, 'no orders in this database');

    await page.goto(`/en/order/${order!.order_number}`);
    await expect(page.getByTestId('order-lookup')).toBeVisible();
  });

  test('revisiting an order does not congratulate you on placing it', async ({ page }) => {
    // "Your order has been received" belongs to the moment of checkout. On a
    // delivered order reached from the account it reads as a system that has
    // lost track.
    const order = await withDb(async (db) => {
      const r = await db.query('select order_number, phone from orders limit 1');
      return r.rows[0] as { order_number: string; phone: string } | undefined;
    });
    test.skip(!order, 'no orders in this database');

    await page.goto(
      `/en/order/${order!.order_number}?phone=${encodeURIComponent(order!.phone)}`
    );
    await expect(page.getByTestId('order-confirmed')).toHaveCount(0);
    await expect(page.locator('h1')).toContainText(order!.order_number);
  });

  test('the right phone opens it', async ({ page }) => {
    const order = await withDb(async (db) => {
      const r = await db.query('select order_number, phone from orders limit 1');
      return r.rows[0] as { order_number: string; phone: string } | undefined;
    });
    test.skip(!order, 'no orders in this database');

    await page.goto(
      `/en/order/${order!.order_number}?phone=${encodeURIComponent(order!.phone)}`
    );
    await expect(page.getByTestId('order-lookup')).toHaveCount(0);
    await expect(page.locator('h1')).toContainText(order!.order_number);
  });

  test('a wrong phone does not', async ({ page }) => {
    const order = await withDb(async (db) => {
      const r = await db.query('select order_number from orders limit 1');
      return r.rows[0] as { order_number: string } | undefined;
    });
    test.skip(!order, 'no orders in this database');

    await page.goto(`/en/order/${order!.order_number}?phone=0790000000`);
    await expect(page.getByTestId('order-lookup')).toBeVisible();
  });
});

test.describe('the sign-in screen does not say who shops here', () => {
  /**
   * The customers table is names, phone numbers and delivery addresses, so
   * "is this number a customer?" is not a question to answer to anyone who
   * asks. Every response below has to look the same for a known number and an
   * invented one.
   */
  const known = normalisePhone('0784' + String(Date.now()).slice(-6));
  const unknown = normalisePhone('0770000123');

  test.beforeAll(async () => {
    await withDb(async (db) =>
      db.query(
        `insert into customers (phone, name, password_hash, registered_at)
         values ($1, 'Known Buyer', $2, now())`,
        [known, await hashPassword(PASSWORD)]
      )
    );
  });

  test.afterAll(async () => {
    await withDb(async (db) => {
      await db.query('delete from customer_otp where phone = any($1)', [[known, unknown]]);
      await db.query('delete from customers where phone = $1', [known]);
    });
  });

  test('a wrong password and an unknown number fail identically', async ({ request }) => {
    const origin = new URL(test.info().project.use.baseURL!).origin;
    /**
     * A distinct client IP per call. Rate limiting is per client, so sharing
     * one would let the second call come back 429 purely because the first had
     * been made — the responses would differ for a reason that has nothing to
     * do with the property under test. It is also the truer simulation: two
     * different people probing.
     */
    const call = (phone: string, ip: string) =>
      request.post('/api/account/login', {
        data: { phone, password: 'definitely not the password' },
        headers: { origin, 'x-forwarded-for': ip },
      });

    const a = await call(known, '203.0.113.11');
    const b = await call(unknown, '203.0.113.12');

    expect(a.status()).toBe(b.status());
    expect(a.status()).not.toBe(429);
    expect(await a.json()).toEqual(await b.json());
  });

  test('requesting a code answers identically either way', async ({ request }) => {
    const origin = new URL(test.info().project.use.baseURL!).origin;
    const call = (phone: string, ip: string) =>
      request.post('/api/account/request-code', {
        data: { phone, locale: 'en' },
        headers: { origin, 'x-forwarded-for': ip },
      });

    const a = await call(known, '203.0.113.21');
    const b = await call(unknown, '203.0.113.22');

    expect(a.status()).toBe(b.status());
    // Guards the guard: a pair of 429s would also be "identical", and would
    // prove nothing about what the endpoint says.
    expect(a.status()).not.toBe(429);
    expect(await a.json()).toEqual(await b.json());
  });

  test('there is no endpoint left that reports a number’s state', async ({ request }) => {
    // This existed, and it was the leak. It must not come back.
    const res = await request.get(
      `/api/account/register?phone=${encodeURIComponent(known)}`,
      { headers: { origin: new URL(test.info().project.use.baseURL!).origin } }
    );
    expect(res.status()).toBe(405);
  });
});
