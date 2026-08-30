// e2e/slider.spec.ts
import { test, expect, type Page } from '@playwright/test';

/**
 * The home-page slider, as a reader meets it.
 *
 * Anonymous: the hero is the first thing a visitor sees, and running these
 * signed in would hide a bug where it only renders for staff.
 */
test.use({ storageState: { cookies: [], origins: [] } });

/** Index of the slide currently faded in. */
async function activeSlide(page: Page): Promise<number> {
  const flags = await page
    .locator('[data-test-id^="slider-slide-"]')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-active')));
  return flags.indexOf('true');
}

test.describe('home page slider', () => {
  test('renders the seeded slides with controls', async ({ page }) => {
    await page.goto('/en');

    const slider = page.getByTestId('slider');
    await expect(slider).toBeVisible();
    await expect(slider).toHaveAttribute('aria-roledescription', 'carousel');
    await expect(page.locator('[data-test-id^="slider-slide-"]')).toHaveCount(3);

    // Exactly one slide is shown at a time; the rest stay mounted so their
    // images are not refetched on every rotation.
    expect(await activeSlide(page)).toBe(0);
  });

  test('the arrows move between slides and wrap around', async ({ page }) => {
    await page.goto('/en');
    // Hovering pauses rotation, so the assertions below cannot race the timer.
    await page.getByTestId('slider').hover();

    await page.getByTestId('slider-next').click();
    await expect.poll(() => activeSlide(page)).toBe(1);

    await page.getByTestId('slider-prev').click();
    await expect.poll(() => activeSlide(page)).toBe(0);

    // Back past the first slide lands on the last, rather than sticking.
    await page.getByTestId('slider-prev').click();
    await expect.poll(() => activeSlide(page)).toBe(2);
  });

  test('a dot jumps straight to its slide', async ({ page }) => {
    await page.goto('/en');
    await page.getByTestId('slider').hover();

    await page.getByTestId('slider-dot-2').click();
    await expect.poll(() => activeSlide(page)).toBe(2);
    await expect(page.getByTestId('slider-dot-2')).toHaveAttribute('aria-current', 'true');
  });

  test('rotation can be stopped, which WCAG requires of anything auto-moving', async ({ page }) => {
    await page.goto('/en');

    const toggle = page.getByTestId('slider-toggle');
    await expect(toggle).toBeVisible();
    await toggle.click();

    // Paused: the slide showing after more than one interval is the same one.
    const before = await activeSlide(page);
    await page.waitForTimeout(7_000);
    expect(await activeSlide(page)).toBe(before);
  });

  test('fits a phone viewport without overflowing the page', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en');

    const slider = page.getByTestId('slider');
    await expect(slider).toBeVisible();

    const box = await slider.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(390);

    // A hero that pushes the document wider than the viewport gives the whole
    // page a horizontal scrollbar — the most common way a slider breaks a
    // phone layout.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // Controls stay reachable rather than being pushed off the edge.
    await expect(page.getByTestId('slider-next')).toBeVisible();
    await expect(page.getByTestId('slider-dot-1')).toBeVisible();
  });

  test('the Arabic tree gets the same slider, right to left', async ({ page }) => {
    await page.goto('/ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('slider')).toBeVisible();
    await expect(page.locator('[data-test-id^="slider-slide-"]')).toHaveCount(3);
  });
});

test.describe('inner-page slider', () => {
  test('the about page gets the two-slide image variant', async ({ page }) => {
    await page.goto('/en/about-us');

    const slider = page.getByTestId('slider');
    await expect(slider).toBeVisible();

    // Two, not three: the inner placement caps at two, and the seeded page
    // uses it rather than the hero variant.
    await expect(page.locator('[data-test-id^="slider-slide-"]')).toHaveCount(2);
    await expect(page.locator('[data-test-id^="slider-video-"]')).toHaveCount(0);
    await expect(page.locator('[data-test-id^="slider-youtube-"]')).toHaveCount(0);
  });

  test('it still rotates and stays inside a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en/about-us');
    await page.getByTestId('slider').hover();

    await page.getByTestId('slider-next').click();
    await expect.poll(() => activeSlide(page)).toBe(1);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
