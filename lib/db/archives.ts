// lib/db/archives.ts
import { db } from './index';
import {
  content, contentI18n, contentTypes, contentCategories, contentTags,
  categories, categoryI18n, tags,
} from './schema';
import { and, desc, eq } from 'drizzle-orm';

export interface ArchiveEntry {
  slug: string;
  title: string;
  excerpt: string | null;
  featuredImage: string | null;
  publishedAt: Date | null;
}

const published = eq(content.status, 'published');

/** Published items of one content type, newest first. */
export async function listByType(
  typeSlug: 'page' | 'post',
  locale: 'ar' | 'en',
  limit = 50
): Promise<ArchiveEntry[]> {
  return db
    .select({
      slug: content.slug,
      title: contentI18n.title,
      excerpt: contentI18n.excerpt,
      featuredImage: content.featuredImage,
      publishedAt: content.publishedAt,
    })
    .from(content)
    .innerJoin(contentTypes, eq(contentTypes.id, content.typeId))
    // innerJoin on i18n: an item with no translation for this locale has
    // nothing to display, so it is excluded rather than rendered title-less.
    .innerJoin(
      contentI18n,
      and(eq(content.id, contentI18n.contentId), eq(contentI18n.locale, locale))
    )
    .where(and(published, eq(contentTypes.slug, typeSlug)))
    .orderBy(desc(content.publishedAt))
    .limit(limit);
}

export async function getCategoryBySlug(slug: string, locale: 'ar' | 'en') {
  const rows = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      isActive: categories.isActive,
      name: categoryI18n.name,
      description: categoryI18n.description,
    })
    .from(categories)
    .leftJoin(
      categoryI18n,
      and(eq(categoryI18n.categoryId, categories.id), eq(categoryI18n.locale, locale))
    )
    .where(eq(categories.slug, slug))
    .limit(1);

  return rows[0] ?? null;
}

export async function listByCategory(
  categoryId: string,
  locale: 'ar' | 'en',
  limit = 50
): Promise<ArchiveEntry[]> {
  return db
    .select({
      slug: content.slug,
      title: contentI18n.title,
      excerpt: contentI18n.excerpt,
      featuredImage: content.featuredImage,
      publishedAt: content.publishedAt,
    })
    .from(contentCategories)
    .innerJoin(content, eq(content.id, contentCategories.contentId))
    .innerJoin(
      contentI18n,
      and(eq(content.id, contentI18n.contentId), eq(contentI18n.locale, locale))
    )
    .where(and(published, eq(contentCategories.categoryId, categoryId)))
    .orderBy(desc(content.publishedAt))
    .limit(limit);
}

export async function getTagBySlug(slug: string) {
  const rows = await db.select().from(tags).where(eq(tags.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function listByTag(
  tagId: string,
  locale: 'ar' | 'en',
  limit = 50
): Promise<ArchiveEntry[]> {
  return db
    .select({
      slug: content.slug,
      title: contentI18n.title,
      excerpt: contentI18n.excerpt,
      featuredImage: content.featuredImage,
      publishedAt: content.publishedAt,
    })
    .from(contentTags)
    .innerJoin(content, eq(content.id, contentTags.contentId))
    .innerJoin(
      contentI18n,
      and(eq(content.id, contentI18n.contentId), eq(contentI18n.locale, locale))
    )
    .where(and(published, eq(contentTags.tagId, tagId)))
    .orderBy(desc(content.publishedAt))
    .limit(limit);
}
