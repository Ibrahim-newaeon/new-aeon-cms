// app/(admin)/admin/media/page.tsx
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { mediaAssets } from '@/lib/db/schema';
import { count, desc, eq } from 'drizzle-orm';
import { verifyAccessToken } from '@/lib/auth/session';
import { MediaLibrary, type MediaAsset } from '@/components/admin/media-library';
import { MediaFolders } from '@/components/admin/media-folders';
import { createTranslator } from '@/lib/admin-i18n';
import { getAdminLocale } from '@/lib/admin-i18n/server';
import { countUnusedAssets, listUnusedAssets } from '@/lib/media/usage';
import { listFolders } from '@/lib/media/folders';

export const dynamic = 'force-dynamic';

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; folder?: string }>;
}) {
  const t = createTranslator(await getAdminLocale());
  const params = await searchParams;
  const showingUnused = params.filter === 'unused';
  const folderId = params.folder ?? null;

  // Bulk cleanup deletes files outright, so it stays admin-only; an editor can
  // still see the filter and delete individually.
  let canCleanup = false;
  try {
    const token = (await cookies()).get('access_token')?.value;
    if (token) canCleanup = (await verifyAccessToken(token)).role === 'admin';
  } catch {
    canCleanup = false;
  }

  const gridQuery = () => {
    const base = db.select().from(mediaAssets);
    // "Unused" and "in this folder" are different questions, so selecting a
    // folder clears the filter rather than intersecting the two.
    if (folderId) return base.where(eq(mediaAssets.folderId, folderId));
    return base;
  };

  const [rows, unusedCount, folders] = await Promise.all([
    showingUnused
      ? listUnusedAssets(200)
      : gridQuery().orderBy(desc(mediaAssets.createdAt)).limit(200),
    countUnusedAssets(),
    listFolders(),
  ]);

  // The "All" row counts the whole library, not the current selection.
  const [total] = await db.select({ value: count() }).from(mediaAssets);

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
    folderId: r.folderId,
    createdAt: r.createdAt ? r.createdAt.toISOString() : null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--admin-text)]">{t('media.title')}</h1>
        <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{t('media.subtitle')}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <MediaFolders folders={folders} rootCount={total?.value ?? 0} selectedId={folderId} />

        <MediaLibrary
          key={`${showingUnused ? 'unused' : 'all'}-${folderId ?? 'root'}`}
          initial={assets}
          unusedCount={unusedCount}
          showingUnused={showingUnused}
          canCleanup={canCleanup}
          folders={folders.map((f) => ({ id: f.id, path: f.path }))}
        />
      </div>
    </div>
  );
}
