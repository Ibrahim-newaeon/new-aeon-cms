// lib/content/list.ts
import { db } from '@/lib/db';
import { content, contentI18n, contentTypes } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import type { ContentRow } from '@/components/admin/content-table';

/**
 * Rows for the admin list, already serialized for the Client Component.
 * Dates become ISO strings here — a Date cannot cross the boundary.
 */
export async function listContentByType(
  typeSlug: 'page' | 'post',
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
      title: contentI18n.title,
    })
    .from(content)
    .leftJoin(
      contentI18n,
      and(eq(content.id, contentI18n.contentId), eq(contentI18n.locale, locale))
    )
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
