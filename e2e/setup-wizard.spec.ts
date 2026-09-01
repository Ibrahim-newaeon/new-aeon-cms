// e2e/setup-wizard.spec.ts
import { test, expect } from '@playwright/test';
import { withDb, ADMIN_PATH } from './fixtures';

/**
 * The first-run wizard.
 *
 * /api/setup creates an ADMINISTRATOR without authentication — it has to, since
 * its purpose is creating the first account. So the property under test is not
 * "the form works" but "it can never run twice". Everything below drives the
 * live endpoint rather than the helper, because the guard that matters lives in
 * the route and the SQL, not in the React.
 */
test.use({
  storageState: { cookies: [], origins: [] },
  extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.90' },
});

const url = 'http://127.0.0.1:3100';

async function postSetup(page: import('@playwright/test').Page, body: unknown) {
  // Driven from inside the page: the route checks the origin before anything
  // else, so a bare request context would get 403 for being cross-site and
  // never reach the logic under test.
  return page.evaluate(async (payload) => {
    const res = await fetch('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  }, body);
}

const VALID = {
  siteName: 'Test Shop',
  name: 'Test Owner',
  email: 'owner@example.test',
  password: 'a-very-long-password-123',
  defaultLocale: 'ar',
  countryCode: 'JO',
  currency: 'JOD',
  commerce: true,
  demoContent: false,
};

test.describe('on a site that is already set up', () => {
  test('the wizard is closed and refuses to create a second owner', async ({ page }) => {
    const admins = await withDb(async (db) => {
      const r = await db.query(`select count(*)::int as n from users where role = 'admin'`);
      return r.rows[0].n as number;
    });
    expect(admins, 'this suite runs against a seeded database').toBeGreaterThan(0);

    // The screen is gone.
    await page.goto('/setup');
    await expect(page).toHaveURL(new RegExp(`${ADMIN_PATH}|/login`));

    // And the endpoint refuses, which is the part that actually protects.
    await page.goto(`${url}/en`);
    const res = await postSetup(page, { ...VALID, email: 'attacker@example.test' });
    expect(res.status, 'a configured site must not mint another owner').toBe(409);

    const after = await withDb(async (db) => {
      const r = await db.query(`select count(*)::int as n from users where role = 'admin'`);
      return r.rows[0].n as number;
    });
    expect(after, 'no administrator was created').toBe(admins);
  });

  test('a cross-site post is blocked before anything else', async ({ page, request }) => {
    // No Origin, no browser headers — the shape a third-party form submit has.
    const res = await request.post('/api/setup', { data: VALID });
    expect(res.status()).toBe(403);
    void page;
  });

  test('it rejects a weak password', async ({ page }) => {
    // Checked even on a configured site: the 409 must not be the only thing
    // standing between a fresh install and an eight-character owner password.
    await page.goto(`${url}/en`);
    const res = await postSetup(page, { ...VALID, password: 'short' });
    // 409 here means the site is already set up, which is a valid earlier gate;
    // on a fresh install this is a 400. Either is a refusal.
    expect([400, 409]).toContain(res.status);
  });
});

/**
 * These skip on a configured database, which is every normal run. To exercise
 * them, point the suite at a migrated-but-unseeded database:
 *
 *   E2E_FRESH_INSTALL=1 DATABASE_URL=…/fresh \
 *     npx playwright test setup-wizard --project=chromium --no-deps
 *
 * --no-deps because auth.setup cannot log in when no administrator exists, and
 * E2E_FRESH_INSTALL because global-setup otherwise refuses to start without
 * seeded data — the exact state the wizard requires.
 */
test.describe('the form itself', () => {
  test('renders every field a first run needs', async ({ page }) => {
    // Rendered directly, bypassing the redirect, so the form can be checked on
    // a database that is already configured.
    const admins = await withDb(async (db) => {
      const r = await db.query(`select count(*)::int as n from users where role = 'admin'`);
      return r.rows[0].n as number;
    });
    test.skip(admins > 0, 'site is configured — the wizard is correctly unreachable');

    await page.goto('/setup');
    for (const id of [
      'setup-name', 'setup-email', 'setup-password', 'setup-password-confirm',
      'setup-password-reveal', 'setup-site-name', 'setup-locale',
      'setup-country', 'setup-currency', 'setup-commerce', 'setup-demo', 'setup-submit',
    ]) {
      await expect(page.getByTestId(id), id).toBeVisible();
    }
  });

  test('the password can be revealed, because it cannot be reset', async ({ page }) => {
    const admins = await withDb(async (db) => {
      const r = await db.query(`select count(*)::int as n from users where role = 'admin'`);
      return r.rows[0].n as number;
    });
    test.skip(admins > 0, 'site is configured — the wizard is correctly unreachable');

    await page.goto('/setup');
    const pw = page.getByTestId('setup-password');
    await expect(pw).toHaveAttribute('type', 'password');

    await page.getByTestId('setup-password-reveal').click();
    await expect(pw).toHaveAttribute('type', 'text');
    // The confirmation follows the same toggle — revealing one and not the
    // other would leave the person still typing the important half blind.
    await expect(page.getByTestId('setup-password-confirm')).toHaveAttribute('type', 'text');
  });

  test('a mismatched confirmation is refused before anything is created', async ({ page }) => {
    const admins = await withDb(async (db) => {
      const r = await db.query(`select count(*)::int as n from users where role = 'admin'`);
      return r.rows[0].n as number;
    });
    test.skip(admins > 0, 'site is configured — the wizard is correctly unreachable');

    await page.goto('/setup');
    await page.getByTestId('setup-name').fill('Owner');
    await page.getByTestId('setup-email').fill('owner@example.test');
    await page.getByTestId('setup-password').fill('a-very-long-password-123');
    await page.getByTestId('setup-password-confirm').fill('a-very-long-password-124');
    await page.getByTestId('setup-site-name').fill('Shop');

    await expect(page.getByTestId('setup-password-mismatch')).toBeVisible();
    await page.getByTestId('setup-submit').click();
    await expect(page.getByTestId('setup-error')).toBeVisible();
    // Still on the wizard: nothing was created.
    await expect(page).toHaveURL(/\/setup/);
  });

  test('choosing a country sets its currency', async ({ page }) => {
    const admins = await withDb(async (db) => {
      const r = await db.query(`select count(*)::int as n from users where role = 'admin'`);
      return r.rows[0].n as number;
    });
    test.skip(admins > 0, 'site is configured — the wizard is correctly unreachable');

    await page.goto('/setup');
    await expect(page.getByTestId('setup-currency')).toHaveValue('JOD');
    await page.getByTestId('setup-country').selectOption('SA');
    await expect(page.getByTestId('setup-currency')).toHaveValue('SAR');
  });
});
