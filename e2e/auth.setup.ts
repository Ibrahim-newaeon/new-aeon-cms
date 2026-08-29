// e2e/auth.setup.ts
import { test as setup, expect } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_PATH, STORAGE_STATE } from './fixtures';

/**
 * Logs in once and saves the session for every other spec.
 *
 * Not merely a speed optimisation. Login is rate-limited to 5 attempts per IP
 * per 15 minutes — a real protection, verified elsewhere — so a suite that
 * logged in per spec would start returning 429 partway through and look flaky
 * when it was actually working correctly.
 */
setup('authenticate as admin', async ({ page }) => {
  await page.goto(`${ADMIN_PATH}/login`);

  await expect(page.getByTestId('login-form')).toBeVisible();

  await page.getByTestId('login-email').fill(ADMIN_EMAIL);
  await page.getByTestId('login-password').fill(ADMIN_PASSWORD);
  await page.getByTestId('login-submit').click();

  // Landing on the dashboard is the assertion — a 200 on the login POST would
  // pass even if the redirect or the cookie were broken.
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 20_000 });
  await expect(page).toHaveURL(new RegExp(`${ADMIN_PATH}(/)?$`));

  await page.context().storageState({ path: STORAGE_STATE });
});
