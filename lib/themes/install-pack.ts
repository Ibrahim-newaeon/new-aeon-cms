// lib/themes/install-pack.ts
// Write an in-memory theme pack to THEMES_DIR and insert the DB row.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { themes } from '@/lib/db/schema';
import type { ThemeManifest } from './package';
import { ensureThemesRoot, themeDir, removeThemeDir } from './store';

export async function installThemePackFiles(
  themeId: string,
  files: Map<string, Buffer>
): Promise<void> {
  await ensureThemesRoot();
  const dir = themeDir(themeId);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });

  for (const [rel, data] of files) {
    const cleaned = rel.replace(/^\/+/, '').split('/').filter((p) => p && p !== '..').join('/');
    const dest = path.join(dir, cleaned);
    if (!dest.startsWith(dir + path.sep) && dest !== dir) {
      throw new Error(`Unsafe path: ${rel}`);
    }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, data);
  }
}

export async function installConvertedTheme(opts: {
  manifest: ThemeManifest;
  files: Map<string, Buffer>;
}): Promise<{ id: string; name: string; version: string }> {
  const id = randomUUID();
  try {
    await installThemePackFiles(id, opts.files);
    const [row] = await db
      .insert(themes)
      .values({
        id,
        name: opts.manifest.name,
        version: opts.manifest.version,
        manifest: opts.manifest,
        isActive: false,
      })
      .returning();
    if (!row) throw new Error('Insert failed');
    return { id: row.id, name: row.name, version: row.version };
  } catch (e) {
    await removeThemeDir(id).catch(() => undefined);
    throw e;
  }
}
