// /lib/db/queries.ts
import { db } from './index';
import { content, contentI18n, categories, categoryI18n, navigation, navigationI18n, settings, tags, mediaAssets, users, contentTypes } from './schema';
import { eq, and, desc, asc, sql, count } from 'drizzle-orm';

/** Row shape returned by getSettings(). */
export type SiteSettings = typeof settings.$inferSelect;

export async function getUserByEmail(email: string) {
  return db.select().from(users).where(eq(users.email, email)).limit(1);
}

export async function getContentList(typeId?: string, status?: string, locale: 'ar' | 'en' = 'ar') {
  const conditions = [];
  if (typeId) conditions.push(eq(content.typeId, typeId));
  if (status) conditions.push(eq(content.status, status as any));
  
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  
  return db.select({
    id: content.id,
    typeId: content.typeId,
    slug: content.slug,
    status: content.status,
    publishedAt: content.publishedAt,
    createdAt: content.createdAt,
    title: contentI18n.title,
    excerpt: contentI18n.excerpt,
    locale: contentI18n.locale,
  })
  .from(content)
  .leftJoin(contentI18n, and(
    eq(content.id, contentI18n.contentId),
    eq(contentI18n.locale, locale)
  ))
  .where(whereClause)
  .orderBy(desc(content.createdAt));
}

export async function getContentBySlug(slug: string, locale: 'ar' | 'en' = 'ar') {
  const result = await db.select({
    content: content,
    i18n: contentI18n,
  })
  .from(content)
  .leftJoin(contentI18n, and(
    eq(content.id, contentI18n.contentId),
    eq(contentI18n.locale, locale)
  ))
  .where(eq(content.slug, slug))
  .limit(1);
  
  return result[0];
}

export async function getCategories(locale: 'ar' | 'en' = 'ar', parentId?: string | null) {
  const conditions = [eq(categories.isActive, true)];
  if (parentId !== undefined) {
    conditions.push(parentId === null 
      ? sql`${categories.parentId} IS NULL`
      : eq(categories.parentId, parentId)
    );
  }
  
  return db.select({
    category: categories,
    i18n: categoryI18n,
  })
  .from(categories)
  .leftJoin(categoryI18n, and(
    eq(categories.id, categoryI18n.categoryId),
    eq(categoryI18n.locale, locale)
  ))
  .where(and(...conditions))
  .orderBy(asc(categories.sortOrder));
}

export async function getNavigation(
  location: 'header' | 'footer' | 'sidebar' | 'mobile',
  locale: 'ar' | 'en' = 'ar'
) {
  // The `locale` argument used to be accepted and ignored — menus rendered in
  // one language on both locales. The join makes it real, falling back to
  // navigation.label when a locale has no translation yet.
  const rows = await db
    .select({
      id: navigation.id,
      url: navigation.url,
      openInNew: navigation.openInNew,
      parentId: navigation.parentId,
      order: navigation.order,
      fallbackLabel: navigation.label,
      localizedLabel: navigationI18n.label,
    })
    .from(navigation)
    .leftJoin(
      navigationI18n,
      and(eq(navigationI18n.navigationId, navigation.id), eq(navigationI18n.locale, locale))
    )
    .where(and(eq(navigation.location, location), eq(navigation.isActive, true)))
    .orderBy(asc(navigation.order));

  return rows.map((r) => ({
    id: r.id,
    label: r.localizedLabel ?? r.fallbackLabel,
    url: r.url,
    openInNew: r.openInNew,
    parentId: r.parentId,
  }));
}

export async function getSettings() {
  const result = await db.select().from(settings).limit(1);
  return result[0] || null;
}

export async function updateSettings(data: Partial<typeof settings.$inferInsert>) {
  const existing = await getSettings();
  if (existing) {
    return db.update(settings).set({ ...data, updatedAt: new Date() })
      .where(eq(settings.id, 1))
      .returning();
  }
  return db.insert(settings).values(data as any).returning();
}

export async function getContentTypeBySlug(slug: string) {
  return db.select().from(contentTypes)
    .where(eq(contentTypes.slug, slug))
    .limit(1);
}

/** Content row plus every locale's translation. Used by the edit form. */
export async function getContentById(id: string) {
  const rows = await db
    .select({ content, i18n: contentI18n })
    .from(content)
    .leftJoin(contentI18n, eq(content.id, contentI18n.contentId))
    .where(eq(content.id, id));

  const first = rows[0];
  if (!first) return null;

  return {
    content: first.content,
    translations: rows
      .map((r) => r.i18n)
      .filter((t): t is NonNullable<typeof t> => t !== null),
  };
}

export async function getContentTypes() {
  return db.select().from(contentTypes).orderBy(asc(contentTypes.sortOrder));
}
