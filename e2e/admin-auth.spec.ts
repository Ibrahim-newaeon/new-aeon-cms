// e2e/admin-auth.spec.ts
import { test, expect } from '@playwright/test';
import { ADMIN_PATH, ADMIN_EMAIL } from './fixtures';

test.describe('admin access control', () => {
  test.describe('signed out', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('the dashboard redirects to login', async ({ page }) => {
      await page.goto(ADMIN_PATH);
      await expect(page).toHaveURL(new RegExp(`${ADMIN_PATH}/login`));
      await expect(page.getByTestId('login-form')).toBeVisible();
    });

    test('a deep admin route also redirects', async ({ page }) => {
      await page.goto(`${ADMIN_PATH}/commerce/orders`);
      await expect(page).toHaveURL(new RegExp(`${ADMIN_PATH}/login`));
    });

    test('a wrong password is refused without revealing whether the user exists', async ({
      page,
    }) => {
      await page.goto(`${ADMIN_PATH}/login`);

      await page.getByTestId('login-email').fill(ADMIN_EMAIL);
      await page.getByTestId('login-password').fill('definitely-not-the-password');
      await page.getByTestId('login-submit').click();

      await expect(page.getByRole('alert')).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${ADMIN_PATH}/login`));

      // The same message must appear for a real and an unknown address, or the
      // form becomes a user-enumeration oracle.
      const realUserError = await page.getByRole('alert').textContent();

      await page.getByTestId('login-email').fill('nobody@example.invalid');
      await page.getByTestId('login-password').fill('definitely-not-the-password');
      await page.getByTestId('login-submit').click();

      await expect(page.getByRole('alert')).toBeVisible();
      expect(await page.getByRole('alert').textContent()).toBe(realUserError);
    });

    test('the API refuses an unauthenticated write, and a cross-site one', async ({
      request,
      baseURL,
    }) => {
      // Same-origin but unauthenticated: the guard checks origin first, so the
      // Origin header has to be right for this to reach the auth check at all.
      const unauthed = await request.post('/api/tags', {
        headers: { origin: baseURL! },
        data: { name: 'nope', slug: 'nope' },
      });
      expect(unauthed.status()).toBe(401);

      // Cross-site is refused before authentication is even considered.
      const crossSite = await request.post('/api/tags', {
        headers: { origin: 'https://evil.example.com' },
        data: { name: 'nope', slug: 'nope' },
      });
      expect(crossSite.status()).toBe(403);
    });
  });

  test.describe('signed in', () => {
    test('the dashboard renders', async ({ page }) => {
      await page.goto(ADMIN_PATH);
      await expect(page.getByTestId('recent-content')).toBeVisible();
    });

    test('every admin section loads', async ({ page }) => {
      const sections = [
        '/content/pages',
        '/content/posts',
        '/content/categories',
        '/content/tags',
        '/media',
        '/navigation',
        '/users',
        '/settings',
        '/forms',
        '/commerce/products',
        '/commerce/brands',
        '/commerce/coupons',
        '/commerce/shipping',
        '/commerce/orders',
      ];

      for (const section of sections) {
        const response = await page.goto(`${ADMIN_PATH}${section}`);
        expect(response?.status(), `${section} should be 200`).toBe(200);
        await expect(page.getByRole('heading', { level: 1 }), section).toBeVisible();
      }
    });

    test('the panel switches language without losing the session', async ({ page }) => {
      await page.goto(`${ADMIN_PATH}/commerce/orders`);
      await page.getByTestId('admin-locale-switcher').click();

      // The switcher reloads the panel; the session must survive it.
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${ADMIN_PATH}/commerce/orders`));
    });
  });
});
