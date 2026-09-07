// lib/themes/store.ts
// Extracted theme packs live under THEMES_DIR (default ./data/themes), not the
// media library — packs are code-like and must not be treated as CMS uploads.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from '@/lib/env';

export function themesRoot(): string {
  const configured = process.env.THEMES_DIR?.trim();
  if (configured) return path.resolve(configured);
  return path.resolve(process.cwd(), 'data', 'themes');
}

export function themeDir(themeId: string): string {
  // UUID only — never trust caller paths.
  if (!/^[0-9a-f-]{36}$/i.test(themeId)) {
    throw new Error('Invalid theme id');
  }
  return path.join(themesRoot(), themeId);
}

export async function ensureThemesRoot(): Promise<string> {
  const root = themesRoot();
  await fs.mkdir(root, { recursive: true });
  return root;
}

export async function removeThemeDir(themeId: string): Promise<void> {
  const dir = themeDir(themeId);
  await fs.rm(dir, { recursive: true, force: true });
}

/** Public URL path prefix for theme static assets. */
export function themeAssetUrl(themeId: string, relativePath: string): string {
  const safe = relativePath.replace(/^\/+/, '').split('/').filter((p) => p && p !== '..').join('/');
  return `/theme-assets/${themeId}/${safe}`;
}

/** Expose for diagnostics; unused env fields stay optional. */
export function themesStorageNote(): string {
  return env.STORAGE_DRIVER === 's3'
    ? 'Theme packs are stored on local disk (THEMES_DIR); media library may use S3.'
    : 'Theme packs are stored on local disk (THEMES_DIR).';
}
