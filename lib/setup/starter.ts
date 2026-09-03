// lib/setup/starter.ts
import 'server-only';
import { db } from '@/lib/db';
import { content, contentI18n, contentTypes } from '@/lib/db/schema';
import type { ContentBlock } from '@/lib/blocks/types';
import { eq } from 'drizzle-orm';

/**
 * The pages a real install cannot open without, created by the setup wizard.
 *
 * ── Why the wizard has to make these ────────────────────────────────────────
 * `scripts/seed.ts` builds a home page, an about page and three legal drafts —
 * but seed is a developer fixture and is not in the production image. The
 * wizard created content TYPES and no content, so a wizard-installed site had
 * an empty `home` row. The storefront handles that by falling back to a hero
 * reading "New Aeon" / "Content Management System" — someone else's brand on a
 * client's homepage, on day one, with no clue where it came from.
 *
 * This is deliberately not the seed's home page. That one is a showcase: three
 * slider images, demo copy, fixtures chosen to exercise the renderer. This is
 * the minimum an operator can log into and edit — their name, a heading, and a
 * sentence pointing at the panel.
 *
 * Everything here is keyed on its slug and skipped if present, so it can never
 * overwrite a page someone has since written.
 */

/**
 * The placeholder paragraph, with "admin panel" as a real link.
 *
 * A `paragraph` block is plain text, so part of it cannot be a link — this is a
 * `rich-text` block instead. The href comes from ADMIN_PATH rather than a
 * hardcoded /admin: the panel is deliberately relocatable, and a seeded link
 * pointing at the wrong place is worse than no link.
 */
export function placeholderWithAdminLink(
  before: string,
  linkText: string,
  after: string
): ContentBlock {
  const adminPath = process.env.ADMIN_PATH || '/admin';
  return {
    type: 'rich-text',
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: before },
            {
              type: 'text',
              marks: [{ type: 'link', attrs: { href: adminPath } }],
              text: linkText,
            },
            { type: 'text', text: after },
          ],
        },
      ],
    },
  };
}

/**
 * The three legal pages every shop is asked for.
 *
 * Created EMPTY and as DRAFTS, deliberately — the same reasoning as the seed.
 * Empty, because a privacy or returns policy is a statement the business is
 * legally bound by, and plausible boilerplate reads as finished so nobody
 * rewrites it. Drafts, because an empty PUBLISHED legal page is worse: a live
 * "Privacy Policy" with no text is a misrepresentation, and answer engines
 * quote it as the shop's actual policy.
 */
const LEGAL_PAGES = [
  { slug: 'privacy-policy',        ar: 'سياسة الخصوصية',            en: 'Privacy Policy' },
  { slug: 'terms-and-conditions',  ar: 'الشروط والأحكام',           en: 'Terms and Conditions' },
  { slug: 'returns-and-refunds',   ar: 'سياسة الإرجاع والاسترداد',  en: 'Returns and Refunds' },
] as const;

export interface StarterResult {
  home: boolean;
  legal: number;
}

export async function installStarterContent(input: {
  siteName: string;
  authorId: string;
}): Promise<StarterResult> {
  const [pageType] = await db
    .select({ id: contentTypes.id })
    .from(contentTypes)
    .where(eq(contentTypes.slug, 'page'))
    .limit(1);

  // install() creates the built-in types immediately before calling this, so
  // this only fails if that changed — in which case writing pages with no type
  // would produce rows the admin cannot open.
  if (!pageType) return { home: false, legal: 0 };

  let home = false;

  const [existingHome] = await db
    .select({ id: content.id })
    .from(content)
    .where(eq(content.slug, 'home'))
    .limit(1);

  if (!existingHome) {
    const [row] = await db
      .insert(content)
      .values({
        typeId: pageType.id,
        slug: 'home',
        authorId: input.authorId,
        status: 'published',
        publishedAt: new Date(),
      })
      .returning();

    if (row) {
      /**
       * The title carries the site name in BOTH locales rather than a
       * translated word for "home". The storefront renders this title as the
       * hero (app/(site)/[locale]/page.tsx), so it is the first thing a
       * visitor reads — and the operator typed exactly one name for their
       * site. Inventing an Arabic and an English variant of it would be
       * putting words in their mouth; they can translate it in the editor.
       */
      await db.insert(contentI18n).values([
        {
          contentId: row.id,
          locale: 'ar',
          title: input.siteName,
          body: [
            { type: 'heading', level: 2, text: 'مرحباً بك' },
            placeholderWithAdminLink('هذه صفحتك الرئيسية. يمكنك تعديلها من ', 'لوحة التحكم', '.'),
          ] satisfies ContentBlock[],
        },
        {
          contentId: row.id,
          locale: 'en',
          title: input.siteName,
          body: [
            { type: 'heading', level: 2, text: 'Welcome' },
            placeholderWithAdminLink('This is your home page. Edit it from the ', 'admin panel', '.'),
          ] satisfies ContentBlock[],
        },
      ]);
      home = true;
    }
  }

  let legal = 0;

  for (const page of LEGAL_PAGES) {
    const [exists] = await db
      .select({ id: content.id })
      .from(content)
      .where(eq(content.slug, page.slug))
      .limit(1);
    if (exists) continue;

    const [row] = await db
      .insert(content)
      .values({
        typeId: pageType.id,
        slug: page.slug,
        authorId: input.authorId,
        status: 'draft',
        publishedAt: null,
      })
      .returning();
    if (!row) continue;

    await db.insert(contentI18n).values([
      { contentId: row.id, locale: 'ar', title: page.ar, body: [] },
      { contentId: row.id, locale: 'en', title: page.en, body: [] },
    ]);
    legal += 1;
  }

  return { home, legal };
}
