// e2e/seo.spec.ts
import { test, expect } from '@playwright/test';
import { withDb } from './fixtures';

/**
 * What a crawler and an answer engine actually receive.
 *
 * Unit tests prove the builders return the right objects. These prove the
 * objects reach the page — which is a different question, and the one that was
 * failing: the metadata helpers were fine, nothing called them.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const PAGES = ['/en', '/en/shop', '/en/about-us', '/ar', '/ar/shop'];

test.describe('SEO head', () => {
  test('every page has a canonical pointing at itself', async ({ page }) => {
    for (const url of PAGES) {
      await page.goto(url);
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(canonical, `${url} has no canonical`).toBeTruthy();
      expect(new URL(canonical!).pathname, url).toBe(url);
    }
  });

  test('every page declares both locales and an x-default', async ({ page }) => {
    for (const url of PAGES) {
      await page.goto(url);
      const langs = await page.locator('link[rel="alternate"]').evaluateAll((els) =>
        els.map((e) => e.getAttribute('hreflang'))
      );
      expect(langs.sort(), url).toEqual(['ar', 'en', 'x-default']);
    }
  });

  test('a shared link carries a title and description, not just a URL', async ({ page }) => {
    // og:image alone rendered as a bare URL in WhatsApp, which is how this
    // shop's links travel.
    await page.goto('/en/about-us');
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /.+/);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', /\/en\/about-us$/);
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', /summary/);
  });

  test('a product share carries its own image', async ({ page }) => {
    await page.goto('/en/shop');
    await page.locator('a[href^="/en/products/"]').first().click();
    await page.waitForURL(/\/en\/products\//);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /^https?:\/\//);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  });
});

test.describe('structured data', () => {
  const ldTypes = (page: import('@playwright/test').Page) =>
    page.locator('script[type="application/ld+json"]').evaluateAll((els) =>
      els.map((e) => JSON.parse(e.textContent || '{}')['@type'])
    );

  test('every page identifies the organisation and the site', async ({ page }) => {
    for (const url of ['/en', '/ar/shop']) {
      await page.goto(url);
      const types = await ldTypes(page);
      expect(types, url).toContain('Organization');
      expect(types, url).toContain('WebSite');
    }
  });

  test('the organisation carries the brand answer and its profiles', async ({ page }) => {
    const settings = await withDb(async (db) => {
      const r = await db.query('select brand_answer, social_links from settings limit 1');
      return r.rows[0] as { brand_answer: string | null; social_links: unknown };
    });
    test.skip(!settings?.brand_answer, 'no brand answer configured');

    await page.goto('/en');
    const org = await page.locator('script[type="application/ld+json"]').evaluateAll((els) =>
      els.map((e) => JSON.parse(e.textContent || '{}')).find((d) => d['@type'] === 'Organization')
    );
    expect(org.description).toBe(settings.brand_answer);
    expect(Array.isArray(org.sameAs) ? org.sameAs.length : 0).toBeGreaterThan(0);
  });

  test('a product page still carries Product and Breadcrumb', async ({ page }) => {
    await page.goto('/en/shop');
    await page.locator('a[href^="/en/products/"]').first().click();

    // Wait for the navigation to land before reading the head. Without this
    // the tags are read from the shop page and the product schema looks
    // missing — which it is not, on either a direct load or a soft one.
    await page.waitForURL(/\/en\/products\//);
    await expect(page.locator('h1')).toBeVisible();

    const types = await ldTypes(page);
    expect(types).toContain('Product');
    expect(types).toContain('BreadcrumbList');
  });
});

test.describe('answer engines', () => {
  test('llms.txt describes the site in plain text', async ({ page }) => {
    const res = await page.goto('/llms.txt');
    expect(res?.status()).toBe(200);
    expect(res?.headers()['content-type']).toContain('text/plain');

    const body = await res!.text();
    expect(body).toContain('## Pages');
    expect(body).toContain('/sitemap.xml');
  });

  test('robots names the AI crawlers rather than leaving it to inference', async ({ page }) => {
    const res = await page.goto('/robots.txt');
    const body = await res!.text();
    for (const agent of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) {
      expect(body, `${agent} not named`).toContain(agent);
    }
    expect(body).toContain('Sitemap:');
  });

  test('a FAQ block publishes both the visible answer and the schema', async ({ page }) => {
    /**
     * The pair is the point: schema claiming an answer the page does not show
     * is exactly what search engines penalise, so both come from one source.
     */
    const hasFaq = await withDb(async (db) => {
      // jsonb @> rather than a LIKE on the serialised text: `body::text`
      // renders as `{"type": "faq"}` WITH a space, so the obvious pattern
      // never matched and this test skipped itself silently.
      const r = await db.query(
        `select count(*)::int as n from content_i18n
         where body @> '[{"type":"faq"}]'::jsonb`
      );
      return (r.rows[0].n as number) > 0;
    });
    test.skip(!hasFaq, 'no FAQ block published');

    await page.goto('/en/about-us');
    await expect(page.getByTestId('faq-block')).toBeVisible();

    const faq = await page.locator('script[type="application/ld+json"]').evaluateAll((els) =>
      els.map((e) => JSON.parse(e.textContent || '{}')).find((d) => d['@type'] === 'FAQPage')
    );
    expect(faq).toBeTruthy();

    // The first answer must appear in the visible text, not only in the tag.
    const answer: string = faq.mainEntity[0].acceptedAnswer.text;
    await expect(page.getByTestId('faq-block')).toContainText(answer.slice(0, 40));
  });
});
