// app/(admin)/admin/media/page.tsx
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { mediaAssets } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { verifyAccessToken } from '@/lib/auth/session';
import { MediaLibrary, type MediaAsset } from '@/components/admin/media-library';
import { createTranslator } from '@/lib/admin-i18n';
import { getAdminLocale } from '@/lib/admin-i18n/server';
import { countUnusedAssets, listUnusedAssets } from '@/lib/media/usage';

export const dynamic = 'force-dynamic';

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const t = createTranslator(await getAdminLocale());
  const params = await searchParams;
  const showingUnused = params.filter === 'unused';

  // Bulk cleanup deletes files outright, so it stays admin-only; an editor can
  // still see the filter and delete individually.
  let canCleanup = false;
  try {
    const token = (await cookies()).get('access_token')?.value;
    if (token) canCleanup = (await verifyAccessToken(token)).role === 'admin';
  } catch {
    canCleanup = false;
  }

  const [rows, unusedCount] = await Promise.all([
    showingUnused
      ? listUnusedAssets(200)
      : db.select().from(mediaAssets).orderBy(desc(mediaAssets.createdAt)).limit(200),
    countUnusedAssets(),
  ]);

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
        <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{t('media.subtitle')}</p>
      </div>

      <MediaLibrary
        key={showingUnused ? 'unused' : 'all'}
        initial={assets}
        unusedCount={unusedCount}
        showingUnused={showingUnused}
        canCleanup={canCleanup}
      />
    </div>
  );
}
