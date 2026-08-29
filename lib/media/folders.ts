// lib/media/folders.ts
import 'server-only';
import { db } from '@/lib/db';
import { mediaFolders, mediaAssets } from '@/lib/db/schema';
import { asc, eq, isNull, sql } from 'drizzle-orm';

/**
 * Media folders — organisation only, never a way to lose a file.
 *
 * One level of nesting, matching categories: a folder may have a parent, and
 * that parent may not. Arbitrary depth means recursive queries, breadcrumbs
 * that wrap, and a move UI nobody enjoys, for a media library that is a flat
 * grid of a few hundred items.
 */

export const MAX_DEPTH = 2;

export interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  assetCount: number;
}

/**
 * `path` is a denormalised breadcrumb, rebuilt on every write rather than
 * patched. With two levels it is cheap, and a path that disagrees with
 * `parent_id` is the classic way this kind of column rots.
 */
function pathFor(name: string, parentName?: string | null): string {
  return parentName ? `${parentName} / ${name}` : name;
}

export async function listFolders(): Promise<FolderNode[]> {
  const rows = await db
    .select({
      id: mediaFolders.id,
      name: mediaFolders.name,
      parentId: mediaFolders.parentId,
      path: mediaFolders.path,
      assetCount: sql<number>`(
        select count(*)::int from media_assets a where a.folder_id = ${mediaFolders.id}
      )`,
    })
    .from(mediaFolders)
    .orderBy(asc(mediaFolders.path));

  return rows;
}

/** How many uploads sit outside every folder. */
export async function countRootAssets(): Promise<number> {
  const rows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(mediaAssets)
    .where(isNull(mediaAssets.folderId));

  return rows[0]?.value ?? 0;
}

export type FolderFailure = 'PARENT_NOT_FOUND' | 'TOO_DEEP' | 'DUPLICATE_NAME';

export type FolderResult<T> = { ok: true; value: T } | { ok: false; reason: FolderFailure };

export async function createFolder(
  name: string,
  parentId: string | null
): Promise<FolderResult<FolderNode>> {
  let parentName: string | null = null;

  if (parentId) {
    const [parent] = await db
      .select()
      .from(mediaFolders)
      .where(eq(mediaFolders.id, parentId))
      .limit(1);

    if (!parent) return { ok: false, reason: 'PARENT_NOT_FOUND' };
    // A folder whose parent already has a parent would be the third level.
    if (parent.parentId) return { ok: false, reason: 'TOO_DEEP' };

    parentName = parent.name;
  }

  const [row] = await db
    .insert(mediaFolders)
    .values({ name, parentId, path: pathFor(name, parentName) })
    .returning();

  return {
    ok: true,
    value: { id: row!.id, name: row!.name, parentId: row!.parentId, path: row!.path, assetCount: 0 },
  };
}

export async function renameFolder(id: string, name: string): Promise<boolean> {
  const [folder] = await db.select().from(mediaFolders).where(eq(mediaFolders.id, id)).limit(1);
  if (!folder) return false;

  let parentName: string | null = null;
  if (folder.parentId) {
    const [parent] = await db
      .select({ name: mediaFolders.name })
      .from(mediaFolders)
      .where(eq(mediaFolders.id, folder.parentId))
      .limit(1);
    parentName = parent?.name ?? null;
  }

  await db
    .update(mediaFolders)
    .set({ name, path: pathFor(name, parentName) })
    .where(eq(mediaFolders.id, id));

  // Children embed the old parent name in their path, so they are rebuilt too.
  const children = await db
    .select()
    .from(mediaFolders)
    .where(eq(mediaFolders.parentId, id));

  for (const child of children) {
    await db
      .update(mediaFolders)
      .set({ path: pathFor(child.name, name) })
      .where(eq(mediaFolders.id, child.id));
  }

  return true;
}

/**
 * Deletes a folder and keeps everything that was in it.
 *
 * Assets move to the root and child folders are promoted. A folder is an
 * organising device; deleting one must never be a way to lose files, and a
 * cascade here would make it exactly that.
 */
export async function deleteFolder(id: string): Promise<{ movedAssets: number }> {
  return db.transaction(async (tx) => {
    const children = await tx.select().from(mediaFolders).where(eq(mediaFolders.parentId, id));

    // Promote children to the root before the parent disappears, or the FK
    // would either block the delete or orphan them.
    for (const child of children) {
      await tx
        .update(mediaFolders)
        .set({ parentId: null, path: pathFor(child.name, null) })
        .where(eq(mediaFolders.id, child.id));
    }

    const moved = await tx
      .update(mediaAssets)
      .set({ folderId: null })
      .where(eq(mediaAssets.folderId, id))
      .returning({ id: mediaAssets.id });

    await tx.delete(mediaFolders).where(eq(mediaFolders.id, id));

    return { movedAssets: moved.length };
  });
}

/** Moves assets into a folder, or to the root when `folderId` is null. */
export async function moveAssets(assetIds: string[], folderId: string | null): Promise<number> {
  if (assetIds.length === 0) return 0;

  if (folderId) {
    const [folder] = await db
      .select({ id: mediaFolders.id })
      .from(mediaFolders)
      .where(eq(mediaFolders.id, folderId))
      .limit(1);
    if (!folder) return 0;
  }

  const moved = await db
    .update(mediaAssets)
    .set({ folderId })
    .where(sql`${mediaAssets.id} in ${assetIds}`)
    .returning({ id: mediaAssets.id });

  return moved.length;
}
