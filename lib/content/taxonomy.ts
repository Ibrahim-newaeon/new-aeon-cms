// lib/content/taxonomy.ts
import { db } from '@/lib/db';
import { contentCategories, contentTags } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { ContentTypeSlug } from '@/lib/content/content-types';

/**
 * Replaces a content item's category and tag links.
 *
 * Delete-then-insert rather than diffing: both are composite-key join tables
 * with no extra columns, so there is nothing to preserve, and the set is small.
 */
export async function setContentTaxonomy(
  contentId: string,
  categoryIds: string[] | undefined,
  tagIds: string[] | undefined
): Promise<void> {
  if (categoryIds) {
    await db.delete(contentCategories).where(eq(contentCategories.contentId, contentId));
    if (categoryIds.length > 0) {
      await db
        .insert(contentCategories)
        .values(categoryIds.map((categoryId) => ({ contentId, categoryId })))
        .onConflictDoNothing();
    }
  }

  if (tagIds) {
    await db.delete(contentTags).where(eq(contentTags.contentId, contentId));
    if (tagIds.length > 0) {
      await db
        .insert(contentTags)
        .values(tagIds.map((tagId) => ({ contentId, tagId })))
        .onConflictDoNothing();
    }
  }
}

/** Options for the pickers in the content form. */
export async function listTaxonomyOptions(locale: 'ar' | 'en') {
  const { categories, categoryI18n, tags, tagI18n } = await import('@/lib/db/schema');
  const { and, asc, eq } = await import('drizzle-orm');

  const [categoryRows, tagRows] = await Promise.all([
    db
      .select({
        id: categories.id,
        slug: categories.slug,
        parentId: categories.parentId,
        name: categoryI18n.name,
      })
      .from(categories)
      .leftJoin(
        categoryI18n,
        and(eq(categoryI18n.categoryId, categories.id), eq(categoryI18n.locale, locale))
      )
      // Deactivated categories stay assignable to nothing new.
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.sortOrder)),
    // leftJoin, not inner: a tag with no translation for this locale must still
    // be assignable, falling back to its reference name below.
    db
      .select({ id: tags.id, slug: tags.slug, name: tags.name, localised: tagI18n.name })
      .from(tags)
      .leftJoin(tagI18n, and(eq(tagI18n.tagId, tags.id), eq(tagI18n.locale, locale)))
      .orderBy(asc(tags.name)),
  ]);

  return {
    categories: categoryRows.map((c) => ({
      id: c.id,
      label: c.name ?? c.slug,
      isChild: Boolean(c.parentId),
    })),
    tags: tagRows.map((t) => ({ id: t.id, label: t.localised ?? t.name })),
  };
}

/** Current assignments for one content item. */
export async function getContentTaxonomy(contentId: string) {
  const [cats, tgs] = await Promise.all([
    db
      .select({ id: contentCategories.categoryId })
      .from(contentCategories)
      .where(eq(contentCategories.contentId, contentId)),
    db
      .select({ id: contentTags.tagId })
      .from(contentTags)
      .where(eq(contentTags.contentId, contentId)),
  ]);

  return { categoryIds: cats.map((c) => c.id), tagIds: tgs.map((t) => t.id) };
}

/** Per-type flags from contentTypes — a type may opt out of either taxonomy. */
export async function getTypeTaxonomyFlags(typeSlug: ContentTypeSlug) {
  const { contentTypes } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const rows = await db
    .select({ hasCategories: contentTypes.hasCategories, hasTags: contentTypes.hasTags })
    .from(contentTypes)
    .where(eq(contentTypes.slug, typeSlug))
    .limit(1);

  return {
    hasCategories: rows[0]?.hasCategories ?? true,
    hasTags: rows[0]?.hasTags ?? true,
  };
}
