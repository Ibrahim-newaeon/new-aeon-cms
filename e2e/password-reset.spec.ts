// e2e/password-reset.spec.ts
import { test, expect, type APIRequestContext } from '@playwright/test';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_PATH, withDb } from './fixtures';

/**
 * Self-service password reset, end to end through the real screens.
 *
 * Signed out throughout — the whole point is that someone locked out can get
 * back in.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const TEMP_PASSWORD = 'e2e-temporary-password-01';

/**
 * A fresh client address per call.
 *
 * Login allows 5 attempts per IP per 15 minutes and `forgot` the same. This
 * spec legitimately makes several of each, so without a distinct address per
 * call it would exhaust the bucket and start reporting 429 as if the feature
 * were broken.
 */
function freshIp(): string {
  return `10.7.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
}

async function attemptLogin(request: APIRequestContext, baseURL: string, password: string) {
  return request.post('/api/auth/login', {
    headers: { origin: baseURL, 'x-forwarded-for': freshIp() },
    data: { email: ADMIN_EMAIL, password },
  });
}

/** Pulls the newest reset link out of the `log` mail driver's outbox. */
function latestResetToken(): string {
  const dir = '.mail-outbox';
  if (!existsSync(dir)) throw new Error('no .mail-outbox — is MAIL_DRIVER still `log`?');

  const newest = readdirSync(dir)
    .filter((f) => f.endsWith('.html'))
    .sort()
    .pop();
  if (!newest) throw new Error('.mail-outbox is empty — no reset email was written');

  const html = readFileSync(`${dir}/${newest}`, 'utf8');
  const match = /\/admin\/reset\?token=([A-Za-z0-9_-]+)/.exec(html);
  if (!match) throw new Error('no reset link in the newest email');
  return match[1]!;
}

test.describe('password reset', () => {
  test.describe.configure({ mode: 'serial' });

  let originalHash: string;

  test.beforeAll(async () => {
    const rows = await withDb((db) =>
      db.query('select password_hash from users where email = $1', [ADMIN_EMAIL])
    );
    originalHash = rows.rows[0].password_hash;
  });

  test.afterAll(async () => {
    // The seeded password is 11 characters and both this flow and the users
    // screen require 12, so it cannot be restored through the feature itself —
    // the hash goes back directly. (That mismatch is a real inconsistency in
    // the seed, noted rather than papered over by weakening the rule.)
    await withDb(async (db) => {
      await db.query('update users set password_hash = $1 where email = $2', [
        originalHash,
        ADMIN_EMAIL,
      ]);
      await db.query('delete from password_reset_tokens');
    });
  });

  test('the login page offers a way through to the reset form', async ({ page }) => {
    await page.goto(`${ADMIN_PATH}/login`);
    await page.getByTestId('login-forgot').click();

    await expect(page).toHaveURL(new RegExp(`${ADMIN_PATH}/forgot`));
    await expect(page.getByTestId('forgot-form')).toBeVisible();
  });

  test('an unknown address gets the same answer as a real one', async ({ page }) => {
    // Anything else turns this form into the user-enumeration oracle the login
    // endpoint deliberately refuses to be.
    await page.goto(`${ADMIN_PATH}/forgot`);
    await page.getByTestId('forgot-email').fill('definitely-nobody@example.invalid');
    await page.getByTestId('forgot-submit').click();

    await expect(page.getByTestId('forgot-sent')).toBeVisible();
    const unknownText = await page.getByTestId('forgot-sent').textContent();

    await page.goto(`${ADMIN_PATH}/forgot`);
    await page.getByTestId('forgot-email').fill(ADMIN_EMAIL);
    await page.getByTestId('forgot-submit').click();

    await expect(page.getByTestId('forgot-sent')).toBeVisible();
    expect(await page.getByTestId('forgot-sent').textContent()).toBe(unknownText);

    // ...and no token exists for an address that has no account.
    const rows = await withDb((db) =>
      db.query(
        `select count(*)::int as n from password_reset_tokens t
           join users u on u.id = t.user_id
          where u.email <> $1`,
        [ADMIN_EMAIL]
      )
    );
    expect(rows.rows[0].n).toBe(0);
  });

  test('a reset link sets a new password, kills old sessions, and cannot be reused', async ({
    page,
    request,
    baseURL,
  }) => {
    await page.goto(`${ADMIN_PATH}/forgot`);
    await page.getByTestId('forgot-email').fill(ADMIN_EMAIL);
    await page.getByTestId('forgot-submit').click();
    await expect(page.getByTestId('forgot-sent')).toBeVisible();

    const token = latestResetToken();

    await page.goto(`${ADMIN_PATH}/reset?token=${token}`);
    await expect(page.getByTestId('reset-form')).toBeVisible();

    await page.getByTestId('reset-password').fill(TEMP_PASSWORD);
    await page.getByTestId('reset-confirm').fill(TEMP_PASSWORD);
    await page.getByTestId('reset-submit').click();

    // Straight back to login, with the confirmation shown.
    await page.waitForURL(new RegExp(`${ADMIN_PATH}/login`), { timeout: 20_000 });
    await expect(page.getByRole('status')).toBeVisible();

    expect((await attemptLogin(request, baseURL!, TEMP_PASSWORD)).status()).toBe(200);
    expect((await attemptLogin(request, baseURL!, ADMIN_PASSWORD)).status()).toBe(401);

    // Every refresh token the user held is revoked: if the reset was prompted
    // by a compromise, leaving the intruder's session alive defeats the point.
    const live = await withDb((db) =>
      db.query(
        `select count(*)::int as n from refresh_tokens
          where user_id = (select id from users where email = $1) and revoked_at is null`,
        [ADMIN_EMAIL]
      )
    );
    // Only the session created by the successful login above.
    expect(live.rows[0].n).toBeLessThanOrEqual(1);

    // Single-use: the same link a second time is refused.
    const reuse = await request.post('/api/auth/reset', {
      headers: { origin: baseURL!, 'x-forwarded-for': freshIp() },
      data: { token, password: 'another-attempt-at-a-password' },
    });
    expect(reuse.status()).toBe(400);
  });

  test('a forged token is refused', async ({ request, baseURL }) => {
    const res = await request.post('/api/auth/reset', {
      headers: { origin: baseURL!, 'x-forwarded-for': freshIp() },
      data: { token: 'x'.repeat(43), password: 'a-perfectly-fine-password' },
    });
    expect(res.status()).toBe(400);
  });

  test('a password below the minimum length is refused', async ({ request, baseURL }) => {
    await withDb((db) => db.query('delete from password_reset_tokens'));

    const forgot = await request.post('/api/auth/forgot', {
      headers: { origin: baseURL!, 'x-forwarded-for': freshIp() },
      data: { email: ADMIN_EMAIL },
    });
    expect(forgot.status()).toBe(200);

    const res = await request.post('/api/auth/reset', {
      headers: { origin: baseURL!, 'x-forwarded-for': freshIp() },
      data: { token: latestResetToken(), password: 'tooshort' },
    });

    expect(res.status()).toBe(400);
  });
});
