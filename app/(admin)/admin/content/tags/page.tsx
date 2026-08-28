// app/(admin)/admin/content/tags/page.tsx
import { db } from '@/lib/db';
import { tags, contentTags } from '@/lib/db/schema';
import { asc, count, eq } from 'drizzle-orm';
import { TagsManager, type TagRow } from '@/components/admin/tags-manager';
import { createTranslator } from '@/lib/admin-i18n';
import { getAdminLocale } from '@/lib/admin-i18n/server';

export default async function TagsPage() {
  const t = createTranslator(await getAdminLocale());
  // Usage count comes from the join table so the delete confirmation can say
  // how much content a tag is attached to before removing it.
  const rows = await db
    .select({
      id: tags.id,
      slug: tags.slug,
      name: tags.name,
      usageCount: count(contentTags.contentId),
    })
    .from(tags)
    .leftJoin(contentTags, eq(contentTags.tagId, tags.id))
    .groupBy(tags.id, tags.slug, tags.name)
    .orderBy(asc(tags.name));

  const initial: TagRow[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    usageCount: Number(r.usageCount),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--admin-text)]">{t('tags.title')}</h1>
        <p className="mt-1 text-sm text-[var(--admin-text-muted)]">
          {t('tags.subtitle')}
        </p>
      </div>

      <TagsManager initial={initial} />
    </div>
  );
}
