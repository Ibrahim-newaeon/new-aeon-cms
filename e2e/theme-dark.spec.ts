// e2e/theme-dark.spec.ts
import { test, expect, type Page } from '@playwright/test';
import { withDb, STORAGE_STATE, ADMIN_PATH } from './fixtures';

/**
 * Light and dark for the saved skin.
 *
 * The whole feature is a cascade question — which of three CSS states wins for
 * a given (mode, device) pair — and a cascade is exactly the thing that looks
 * right in the source and resolves wrong in the browser. So nothing here reads
 * the stylesheet; every assertion is the COMPUTED background of <body>, which
 * is what a visitor actually sees.
 *
 * The body rule is itself the reason this file exists: the storefront's
 * components were all token-driven, but the page behind them painted nothing,
 * so a dark theme used to emit perfect tokens onto a white page.
 */
test.use({
  storageState: { cookies: [], origins: [] },
  // Its own rate-limit bucket: every browser test otherwise shares 127.0.0.1.
  extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.61' },
});

const LIGHT = 'rgb(255, 255, 255)'; // Aeon light  --site-surface #ffffff
const DARK = 'rgb(15, 17, 21)'; //    Aeon dark   --site-surface #0f1115

/** What the visitor's screen is actually painted. */
const bodyBg = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

async function saveTheme(mode: 'light' | 'dark' | 'auto', withDarkVariant = true) {
  const { SKINS } = await import('../lib/theme/presets');
  const skin = SKINS.find((s) => s.id === 'aeon')!;
  await withDb(async (db) => {
    await db.query('update settings set theme = $1, theme_dark = $2, theme_mode = $3', [
      JSON.stringify(skin.light),
      withDarkVariant ? JSON.stringify(skin.dark) : null,
      mode,
    ]);
  });
}

let saved: { theme: unknown; themeDark: unknown; themeMode: string } | null = null;

test.beforeAll(async () => {
  // Captured and put back in afterAll: this spec rewrites site-wide settings,
  // and leaving the storefront dark would be a confusing thing to hand back to
  // whoever runs the suite locally.
  saved = await withDb(async (db) => {
    const r = await db.query('select theme, theme_dark, theme_mode from settings limit 1');
    return {
      theme: r.rows[0]?.theme ?? null,
      themeDark: r.rows[0]?.theme_dark ?? null,
      themeMode: r.rows[0]?.theme_mode ?? 'light',
    };
  });
});

test.afterAll(async () => {
  if (!saved) return;
  await withDb(async (db) => {
    await db.query('update settings set theme = $1, theme_dark = $2, theme_mode = $3', [
      saved!.theme ? JSON.stringify(saved!.theme) : null,
      saved!.themeDark ? JSON.stringify(saved!.themeDark) : null,
      saved!.themeMode,
    ]);
  });
});

test.describe('a forced mode ignores the device', () => {
  test('light stays light on a dark device', async ({ page }) => {
    // The regression the :not([data-theme="light"]) guard exists for. Without
    // it the media query overrides a business that deliberately chose light.
    await saveTheme('light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/en');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await bodyBg(page)).toBe(LIGHT);
  });

  test('dark stays dark on a light device', async ({ page }) => {
    // The mirror case: without the :root[data-theme="dark"] block, forcing
    // dark would do nothing for the majority of visitors, whose devices are
    // set to light.
    await saveTheme('dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/en');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await bodyBg(page)).toBe(DARK);
  });
});

test.describe('auto follows the device', () => {
  test('dark device gets dark', async ({ page }) => {
    await saveTheme('auto');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/en');

    // Nothing stamped — the ABSENCE of the attribute is what lets the media
    // query decide. Stamping "auto" would match neither selector.
    expect(await page.locator('html').getAttribute('data-theme')).toBeNull();
    expect(await bodyBg(page)).toBe(DARK);
  });

  test('light device gets light', async ({ page }) => {
    await saveTheme('auto');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/en');
    expect(await bodyBg(page)).toBe(LIGHT);
  });
});

test('a site with no dark colours stays light on a dark device', async ({ page }) => {
  // Asking for dark with nothing saved must fall back, not blank the page.
  await saveTheme('auto', false);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/en');
  expect(await bodyBg(page)).toBe(LIGHT);
});

test('dark carries through the storefront, not just the home page', async ({ page }) => {
  // Per-route regressions are the usual shape of a half-done dark mode: one
  // page group has its own layout and keeps painting light.
  await saveTheme('dark');
  await page.emulateMedia({ colorScheme: 'light' });

  for (const path of ['/en', '/en/shop', '/en/cart', '/ar', '/ar/shop']) {
    await page.goto(path);
    expect(await bodyBg(page), path).toBe(DARK);
  }
});

test('text stays readable against the dark page', async ({ page }) => {
  // The tokens can all apply and still leave dark-on-dark if a component pulled
  // a colour from outside the palette. Checks the rendered contrast rather than
  // the saved hex values.
  await saveTheme('dark');
  await page.goto('/en/shop');

  const luminance = (rgb: string) => {
    const [r, g, b] = rgb.match(/\d+/g)!.slice(0, 3).map((n) => Number(n) / 255);
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
  };

  const heading = page.getByRole('heading', { level: 1 }).first();
  const [fg, bg] = [
    await heading.evaluate((el) => getComputedStyle(el).color),
    await bodyBg(page),
  ];

  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  expect((hi! + 0.05) / (lo! + 0.05)).toBeGreaterThan(4.5);
});

test.describe('the Settings control', () => {
  // Back to the admin session the rest of the suite uses; the file opted out
  // above because the storefront assertions are about anonymous visitors.
  test.use({ storageState: STORAGE_STATE });

  /** The theme editor lives behind the Appearance tab, not on the landing tab. */
  async function openAppearance(page: Page) {
    await page.goto(`${ADMIN_PATH}/settings`);
    await page.getByTestId('settings-tab-appearance').click();
    await expect(page.getByTestId('theme-editor')).toBeVisible();
  }

  test('offers both variants of every skin, and a mode for the site', async ({ page }) => {
    await openAppearance(page);

    // Three modes, exactly one active.
    for (const mode of ['light', 'dark', 'auto']) {
      await expect(page.getByTestId(`theme-mode-${mode}`)).toBeVisible();
    }
    await expect(page.locator('[data-test-id^="theme-mode-"][aria-pressed="true"]')).toHaveCount(1);

    // Each skin advertises BOTH halves in its swatch: light accent + page,
    // dark accent + page. A skin that showed only its light half would be
    // asking someone to pick a dark theme they cannot see.
    await expect(page.getByTestId('theme-preset-aeon').locator('span[aria-hidden]')).toHaveCount(4);
  });

  test('the variant tab switches which colours are being edited', async ({ page }) => {
    await openAppearance(page);

    // Start from a known pair rather than whatever the site currently holds.
    await page.getByTestId('theme-preset-aeon').click();

    const surface = page.getByTestId('theme-slot-surface');
    await expect(surface).toHaveValue('#ffffff');

    await page.getByTestId('theme-edit-dark').click();
    // The dark tab must show the DARK page colour. Showing #ffffff here was the
    // failure mode this guards: unset dark slots resolving to light fallbacks,
    // so the dark tab looked like a light theme.
    await expect(surface).toHaveValue('#0f1115');

    await page.getByTestId('theme-edit-light').click();
    await expect(surface).toHaveValue('#ffffff');
  });

  test('says so when dark is chosen with no dark colours saved', async ({ page }) => {
    await openAppearance(page);
    await page.getByTestId('theme-preset-aeon').click();
    await page.getByTestId('theme-mode-dark').click();

    // A skin was just applied, so there ARE dark colours: no warning.
    await expect(page.getByTestId('theme-mode-warning')).toHaveCount(0);

    // Clear them from the dark tab and the warning has to appear — otherwise
    // choosing dark would silently do nothing.
    await page.getByTestId('theme-edit-dark').click();
    await page.getByTestId('theme-reset').click();
    await expect(page.getByTestId('theme-mode-warning')).toBeVisible();
  });
});
