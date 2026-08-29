// lib/content/tag-i18n.ts
import { db } from '@/lib/db';
import { tagI18n } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';

export interface TagTranslation {
  locale: 'ar' | 'en';
  name: string;
}

/**
 * Replaces a tag's translations.
 *
 * Blank names delete that locale's row rather than storing an empty string:
 * an empty translation and no translation must behave identically, or the
 * fallback to `tags.name` would render "" instead of the reference name.
 *
 * `undefined` means "not submitted" and leaves existing rows alone, which is
 * what keeps an API client that does not know about translations from wiping
 * them.
 */
export async function setTagTranslations(
  tagId: string,
  translations: TagTranslation[] | undefined
): Promise<void> {
  if (!translations) return;

  const filled = translations.filter((t) => t.name.trim() !== '');
  const emptied = translations
    .filter((t) => t.name.trim() === '')
    .map((t) => t.locale);

  if (emptied.length > 0) {
    await db
      .delete(tagI18n)
      .where(and(eq(tagI18n.tagId, tagId), inArray(tagI18n.locale, emptied)));
  }

  for (const t of filled) {
    await db
      .insert(tagI18n)
      .values({ tagId, locale: t.locale, name: t.name.trim() })
      .onConflictDoUpdate({
        target: [tagI18n.tagId, tagI18n.locale],
        set: { name: t.name.trim() },
      });
  }
}
