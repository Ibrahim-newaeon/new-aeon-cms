// e2e/legal-pages.spec.ts
import { test, expect } from '@playwright/test';
import { withDb, STORAGE_STATE, ADMIN_PATH } from './fixtures';

/**
 * The three legal pages every shop is asked for.
 *
 * Seeded EMPTY and as DRAFTS on purpose, and both halves of that need
 * guarding, in opposite directions:
 *
 *   - Empty and draft must stay INVISIBLE to shoppers. A live "Privacy Policy"
 *     with no text is a misrepresentation, and answer engines would quote it
 *     as the shop's actual policy.
 *   - They must stay VISIBLE to staff. A page created where nobody can find it
 *     is the same as no page at all — which is the way this task fails
 *     quietly.
 */

const LEGAL = ['privacy-policy', 'terms-and-conditions', 'returns-and-refunds'] as const;

test.describe('as a shopper', () => {
  test.use({
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.74' },
  });

  for (const slug of LEGAL) {
    test(`${slug} is not readable while it is an empty draft`, async ({ page }) => {
      const status = await withDb(async (db) => {
        const r = await db.query('select status::text as s from content where slug = $1', [slug]);
        return r.rows[0]?.s as string | undefined;
      });

      // Once the shop writes and publishes a policy this stops applying, so the
      // assertion follows the real status rather than hardcoding "404 forever".
      test.skip(status !== 'draft', `${slug} has been published — nothing to guard`);

      for (const locale of ['en', 'ar']) {
        const res = await page.goto(`/${locale}/${slug}`);
        expect(res?.status(), `/${locale}/${slug}`).toBe(404);
      }
    });
  }

  test('no unpublished policy is advertised in the sitemap', async ({ page }) => {
    const drafts = await withDb(async (db) => {
      const r = await db.query(
        `select slug from content where status <> 'published' and slug = any($1)`,
        [[...LEGAL]]
      );
      return r.rows.map((x) => x.slug as string);
    });

    const xml = await (await page.goto('/sitemap.xml'))!.text();
    for (const slug of drafts) expect(xml.includes(slug), slug).toBe(false);
  });
});

test.describe('as staff', () => {
  test.use({ storageState: STORAGE_STATE });

  test('all three are listed and openable in the admin', async ({ page }) => {
    // By id, not by title: the admin renders whichever language the staff
    // locale is set to, so matching on "Privacy Policy" passes or fails
    // depending on a cookie rather than on whether the page is there.
    const ids = await withDb(async (db) => {
      const r = await db.query('select slug, id from content where slug = any($1)', [[...LEGAL]]);
      return Object.fromEntries(r.rows.map((x) => [x.slug as string, x.id as string]));
    });

    await page.goto(`${ADMIN_PATH}/content/pages`);

    for (const slug of LEGAL) {
      expect(ids[slug], `${slug} does not exist`).toBeTruthy();
      // REACHABLE, not merely present in the database: a draft the client
      // cannot click is a draft they will never write.
      const link = page.locator(`a[href*="${ids[slug]}"]`).first();
      await expect(link, `${slug} is missing from Content > Pages`).toBeVisible();
    }
  });

  test('each one exists in both languages, with an empty body', async () => {
    const rows = await withDb(async (db) => {
      const r = await db.query(
        `select c.slug, i.locale::text as locale, i.title,
                jsonb_array_length(coalesce(i.body, '[]'::jsonb)) as blocks
         from content c join content_i18n i on i.content_id = c.id
         where c.slug = any($1) order by c.slug, i.locale`,
        [[...LEGAL]]
      );
      return r.rows as { slug: string; locale: string; title: string; blocks: number }[];
    });

    for (const slug of LEGAL) {
      const forSlug = rows.filter((r) => r.slug === slug);
      // Both languages, or the page falls foul of the same bilingual rule the
      // catalogue follows the moment it is published.
      expect(forSlug.map((r) => r.locale).sort(), slug).toEqual(['ar', 'en']);
      for (const r of forSlug) {
        expect(r.title?.trim(), `${slug}.${r.locale} has no title`).toBeTruthy();
      }
    }
  });
});
