// lib/seo/readiness.ts
import 'server-only';
import { db } from '@/lib/db';
import { content, contentI18n, products, productI18n } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { getSettings } from '@/lib/db/queries';

/**
 * Whether the fields that need a human have had one.
 *
 * The tags, schema and llms.txt are generated — they cannot be forgotten. What
 * CAN be forgotten is the writing: nobody but the shop can produce a brand
 * answer or a real FAQ, and a settings field left blank looks identical to one
 * that was never needed.
 *
 * So this reports state rather than scoring it. "Brand answer: not written" is
 * actionable; "SEO 72%" is a number someone argues with.
 */

export type CheckState = 'done' | 'missing' | 'partial';

export interface Check {
  id: string;
  state: CheckState;
  /** Filled into the message, e.g. how many products lack a description. */
  count?: number;
  total?: number;
}

export async function seoReadiness(locale: 'ar' | 'en'): Promise<Check[]> {
  const settings = await getSettings();

  const [faqRows, productText, pageMeta] = await Promise.all([
    // Any published page carrying a FAQ block.
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(contentI18n)
      .innerJoin(content, eq(content.id, contentI18n.contentId))
      .where(
        and(eq(content.status, 'published'), sql`${contentI18n.body} @> '[{"type":"faq"}]'::jsonb`)
      ),

    // Products whose schema would carry a description.
    db
      .select({
        total: sql<number>`count(distinct ${products.id})::int`,
        described: sql<number>`count(distinct ${products.id}) filter (
          where coalesce(${productI18n.description}, '') <> ''
        )::int`,
      })
      .from(products)
      .leftJoin(
        productI18n,
        and(eq(productI18n.productId, products.id), eq(productI18n.locale, locale))
      )
      .where(eq(products.isActive, true)),

    // Published pages with their own meta description.
    db
      .select({
        total: sql<number>`count(*)::int`,
        described: sql<number>`count(*) filter (
          where coalesce(${contentI18n.metaDescription}, ${contentI18n.excerpt}, '') <> ''
        )::int`,
      })
      .from(content)
      .innerJoin(
        contentI18n,
        and(eq(contentI18n.contentId, content.id), eq(contentI18n.locale, locale))
      )
      .where(eq(content.status, 'published')),
  ]);

  const socials = Object.values((settings?.socialLinks ?? {}) as Record<string, string>).filter(
    (v) => v && v.trim()
  ).length;

  const partial = (done: number, total: number): CheckState =>
    total === 0 || done === total ? 'done' : done === 0 ? 'missing' : 'partial';

  return [
    { id: 'brandAnswer', state: settings?.brandAnswer?.trim() ? 'done' : 'missing' },
    { id: 'siteDescription', state: settings?.siteDescription?.trim() ? 'done' : 'missing' },
    { id: 'logo', state: settings?.logo ? 'done' : 'missing' },
    { id: 'social', state: socials > 0 ? 'done' : 'missing', count: socials },
    { id: 'faq', state: (faqRows[0]?.n ?? 0) > 0 ? 'done' : 'missing', count: faqRows[0]?.n ?? 0 },
    {
      id: 'productText',
      state: partial(productText[0]?.described ?? 0, productText[0]?.total ?? 0),
      count: productText[0]?.described ?? 0,
      total: productText[0]?.total ?? 0,
    },
    {
      id: 'pageMeta',
      state: partial(pageMeta[0]?.described ?? 0, pageMeta[0]?.total ?? 0),
      count: pageMeta[0]?.described ?? 0,
      total: pageMeta[0]?.total ?? 0,
    },
  ];
}
