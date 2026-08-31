// lib/content/list.ts
import { db } from '@/lib/db';
import { content, contentTypes } from '@/lib/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import type { ContentRow } from '@/components/admin/content-table';
import type { ContentTypeSlug } from '@/lib/content/content-types';

/**
 * Rows for the admin list, already serialized for the Client Component.
 * Dates become ISO strings here — a Date cannot cross the boundary.
 */
export async function listContentByType(
  typeSlug: ContentTypeSlug,
  locale: 'ar' | 'en' = 'ar'
): Promise<ContentRow[]> {
  const types = await db
    .select({ id: contentTypes.id })
    .from(contentTypes)
    .where(eq(contentTypes.slug, typeSlug))
    .limit(1);

  const typeId = types[0]?.id;
  if (!typeId) return [];

  const rows = await db
    .select({
      id: content.id,
      slug: content.slug,
      status: content.status,
      createdAt: content.createdAt,
      /**
       * This locale's title, falling back to any other.
       *
       * The fallback is not cosmetic. This used to LEFT JOIN on the locale, so
       * a page with no title in the language being viewed came back null and
       * rendered as a blank row — an item the editor can see exists but cannot
       * identify or search for. Showing the other language's title is worse
       * than showing this one's and far better than showing nothing.
       *
       * `content.id` is written RAW inside the subquery: drizzle emits an
       * interpolated column unqualified when one table is in scope, which here
       * would bind to content_i18n's own id and match every row.
       */
      title: sql<string | null>`coalesce(
        (select t.title from content_i18n t
          where t.content_id = content.id and t.locale::text = ${locale}
            and coalesce(trim(t.title), '') <> ''),
        (select t.title from content_i18n t
          where t.content_id = content.id and coalesce(trim(t.title), '') <> ''
          order by t.locale limit 1)
      )`,
    })
    .from(content)
    .where(eq(content.typeId, typeId))
    .orderBy(desc(content.createdAt));

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    status: r.status,
    title: r.title,
    createdAt: r.createdAt ? r.createdAt.toISOString() : null,
  }));
}
