// lib/content/types-admin.ts
import 'server-only';
import { db } from '@/lib/db';
import { contentTypes, content } from '@/lib/db/schema';
import { and, asc, eq, sql } from 'drizzle-orm';
import { prefixProblem, normalisePrefix, isBuiltInType } from './type-registry';
import { locales } from '@/lib/env';

export interface ContentTypeRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  routePrefix: string | null;
  hasArchive: boolean;
  hasCategories: boolean;
  hasTags: boolean;
  hasFeaturedImage: boolean;
  isActive: boolean;
  isBuiltIn: boolean;
  entryCount: number;
}

export async function listContentTypes(): Promise<ContentTypeRow[]> {
  const rows = await db
    .select({
      id: contentTypes.id,
      slug: contentTypes.slug,
      name: contentTypes.name,
      description: contentTypes.description,
      routePrefix: contentTypes.routePrefix,
      hasArchive: sql<boolean>`coalesce(${contentTypes.hasArchive}, true)`,
      hasCategories: sql<boolean>`coalesce(${contentTypes.hasCategories}, true)`,
      hasTags: sql<boolean>`coalesce(${contentTypes.hasTags}, true)`,
      hasFeaturedImage: sql<boolean>`coalesce(${contentTypes.hasFeaturedImage}, true)`,
      isActive: sql<boolean>`coalesce(${contentTypes.isActive}, true)`,
      isBuiltIn: sql<boolean>`coalesce(${contentTypes.isBuiltIn}, false)`,
      entryCount: sql<number>`(
        select count(*) from ${content} where ${content.typeId} = content_types.id
      )::int`,
    })
    .from(contentTypes)
    .orderBy(asc(contentTypes.sortOrder), asc(contentTypes.slug));

  return rows;
}

/** Prefixes already spoken for, so a new type cannot claim one twice. */
export async function takenPrefixes(excludeId?: string): Promise<string[]> {
  const rows = await db
    .select({ id: contentTypes.id, routePrefix: contentTypes.routePrefix })
    .from(contentTypes);

  return rows
    .filter((r) => r.routePrefix && r.id !== excludeId)
    .map((r) => r.routePrefix as string);
}

/**
 * Validates a prefix against everything already claiming a URL.
 *
 * Returns a human sentence rather than a code, because the only useful version
 * of this error names the word that is taken.
 */
export async function checkPrefix(
  raw: string | null | undefined,
  excludeId?: string
): Promise<{ ok: true; value: string | null } | { ok: false; message: string }> {
  // No prefix is a valid answer: `page` entries live at the site root, and a
  // type may exist purely as internal structure.
  if (!raw || !raw.trim()) return { ok: true, value: null };

  const problem = prefixProblem(raw, locales, await takenPrefixes(excludeId));

  if (!problem) {
    const value = normalisePrefix(raw);

    /**
     * A published page at the same address wins the URL, so a type whose
     * archive would sit under it could never be reached. Refused here, where
     * the person can still pick another word, rather than silently at request
     * time where it looks like the archive is broken.
     */
    const [clash] = await db
      .select({ slug: content.slug })
      .from(content)
      .where(and(eq(content.slug, value), eq(content.status, 'published')))
      .limit(1);

    if (clash) {
      return {
        ok: false,
        message: `A published page already lives at "/${value}" — pick another address.`,
      };
    }

    return { ok: true, value };
  }

  const message =
    problem.kind === 'reserved'
      ? `"${problem.word}" is already a page on this site — pick another address.`
      : problem.kind === 'taken'
        ? `"${problem.word}" is used by another content type.`
        : problem.kind === 'locale'
          ? 'That is a language code, so it cannot also be an address.'
          : problem.kind === 'tooLong'
            ? 'Too long — 64 characters at most.'
            : problem.kind === 'empty'
              ? 'Enter an address, or leave it blank for no public page.'
              : 'Use lowercase letters, numbers and dashes.';

  return { ok: false, message };
}

/** A built-in type is structural: deleting it would orphan its screens. */
export async function canDelete(id: string): Promise<{ ok: boolean; reason?: string }> {
  const [row] = await db
    .select({
      slug: contentTypes.slug,
      isBuiltIn: contentTypes.isBuiltIn,
      entries: sql<number>`(
        select count(*) from ${content} where ${content.typeId} = content_types.id
      )::int`,
    })
    .from(contentTypes)
    .where(eq(contentTypes.id, id))
    .limit(1);

  if (!row) return { ok: false, reason: 'Not found.' };
  if (row.isBuiltIn || isBuiltInType(row.slug)) {
    return { ok: false, reason: 'Built-in types cannot be deleted.' };
  }
  if (row.entries > 0) {
    // Deleting would leave content rows pointing at nothing, and "delete the
    // type" is not a request to delete what people wrote.
    return { ok: false, reason: `This type still has ${row.entries} entries. Move or delete them first.` };
  }
  return { ok: true };
}

/** A type's public prefix, for building links. */
export async function prefixOf(slug: string): Promise<string | null> {
  const [row] = await db
    .select({ routePrefix: contentTypes.routePrefix })
    .from(contentTypes)
    .where(eq(contentTypes.slug, slug))
    .limit(1);
  return row?.routePrefix ?? null;
}

/** The type that owns a public URL prefix, if any. */
export async function typeByPrefix(prefix: string) {
  const [row] = await db
    .select({
      id: contentTypes.id,
      slug: contentTypes.slug,
      name: contentTypes.name,
      routePrefix: contentTypes.routePrefix,
      hasArchive: contentTypes.hasArchive,
      isActive: contentTypes.isActive,
    })
    .from(contentTypes)
    .where(eq(contentTypes.routePrefix, normalisePrefix(prefix)))
    .limit(1);

  return row && row.isActive !== false ? row : null;
}
