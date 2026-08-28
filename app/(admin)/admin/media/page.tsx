// app/(admin)/admin/media/page.tsx
import { db } from '@/lib/db';
import { mediaAssets } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { MediaLibrary, type MediaAsset } from '@/components/admin/media-library';
import { createTranslator } from '@/lib/admin-i18n';
import { getAdminLocale } from '@/lib/admin-i18n/server';

export default async function MediaPage() {
  const t = createTranslator(await getAdminLocale());
  const rows = await db
    .select()
    .from(mediaAssets)
    .orderBy(desc(mediaAssets.createdAt))
    .limit(200);

  // Dates must be serialized before crossing into the Client Component.
  const assets: MediaAsset[] = rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    originalName: r.originalName,
    mimeType: r.mimeType,
    size: r.size,
    url: r.url,
    thumbnailUrl: r.thumbnailUrl,
    width: r.width,
    height: r.height,
    altText: r.altText,
    createdAt: r.createdAt ? r.createdAt.toISOString() : null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--admin-text)]">{t('media.title')}</h1>
        <p className="mt-1 text-sm text-[var(--admin-text-muted)]">
          {t('media.subtitle')}
        </p>
      </div>

      <MediaLibrary initial={assets} />
    </div>
  );
}
