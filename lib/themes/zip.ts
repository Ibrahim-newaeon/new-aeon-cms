// lib/themes/zip.ts
// Validate and extract an HTML theme zip into a theme directory.

import JSZip from 'jszip';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import {
  MAX_THEME_FILES,
  MAX_THEME_FILE_BYTES,
  MAX_THEME_UNCOMPRESSED_BYTES,
  MAX_THEME_ZIP_BYTES,
  THEME_ALLOWED_EXTENSIONS,
} from './limits';
import { themeManifestSchema, type ThemeManifest } from './package';
import { ensureThemesRoot, themeDir } from './store';

export class ThemeZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ThemeZipError';
  }
}

function extOf(name: string): string {
  const base = name.split('/').pop() ?? name;
  const i = base.lastIndexOf('.');
  return i >= 0 ? base.slice(i).toLowerCase() : '';
}

function normalizeEntryName(name: string): string | null {
  const cleaned = name.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!cleaned || cleaned.endsWith('/')) return null;
  if (cleaned.includes('..')) return null;
  if (cleaned.startsWith('__MACOSX/')) return null;
  if (path.isAbsolute(cleaned)) return null;
  return cleaned;
}

export async function extractThemeZip(
  themeId: string,
  zipBuffer: Buffer
): Promise<ThemeManifest> {
  if (zipBuffer.byteLength > MAX_THEME_ZIP_BYTES) {
    throw new ThemeZipError(`Zip exceeds ${MAX_THEME_ZIP_BYTES} bytes`);
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBuffer);
  } catch {
    throw new ThemeZipError('Invalid zip archive');
  }

  const entries: { name: string; data: Buffer }[] = [];
  let total = 0;
  let count = 0;

  const names = Object.keys(zip.files);
  for (const raw of names) {
    const file = zip.files[raw];
    if (!file || file.dir) continue;
    const name = normalizeEntryName(raw);
    if (!name) continue;

    count++;
    if (count > MAX_THEME_FILES) {
      throw new ThemeZipError(`Zip has more than ${MAX_THEME_FILES} files`);
    }

    const ext = extOf(name);
    if (!THEME_ALLOWED_EXTENSIONS.has(ext) && name !== 'theme.json') {
      throw new ThemeZipError(`Disallowed file type: ${name}`);
    }

    const data = Buffer.from(await file.async('uint8array'));
    if (data.byteLength > MAX_THEME_FILE_BYTES) {
      throw new ThemeZipError(`File too large: ${name}`);
    }
    total += data.byteLength;
    if (total > MAX_THEME_UNCOMPRESSED_BYTES) {
      throw new ThemeZipError('Uncompressed theme exceeds size limit');
    }
    entries.push({ name, data });
  }

  const manifestEntry = entries.find(
    (e) => e.name === 'theme.json' || e.name.endsWith('/theme.json')
  );
  if (!manifestEntry) {
    throw new ThemeZipError('theme.json is required at the pack root (or one folder deep)');
  }

  // If the zip wraps a single top-level folder, strip that prefix.
  const prefix = manifestEntry.name === 'theme.json'
    ? ''
    : manifestEntry.name.slice(0, manifestEntry.name.length - 'theme.json'.length);

  const stripped = entries.map((e) => ({
    name: prefix && e.name.startsWith(prefix) ? e.name.slice(prefix.length) : e.name,
    data: e.data,
  }));

  let manifestJson: unknown;
  try {
    const rawManifest = stripped.find((e) => e.name === 'theme.json');
    if (!rawManifest) throw new Error('missing');
    manifestJson = JSON.parse(rawManifest.data.toString('utf8'));
  } catch {
    throw new ThemeZipError('theme.json is not valid JSON');
  }

  const parsed = themeManifestSchema.safeParse(manifestJson);
  if (!parsed.success) {
    throw new ThemeZipError(
      `Invalid theme.json: ${parsed.error.issues.map((i) => i.message).join('; ')}`
    );
  }
  const manifest = parsed.data;

  // Every referenced template/partial must exist in the zip.
  const files = new Set(stripped.map((e) => e.name));
  const required = [
    manifest.templates.layout,
    manifest.templates.home,
    manifest.templates.page,
    manifest.templates.post,
    manifest.templates.blog,
    ...Object.values(manifest.partials ?? {}),
  ].filter(Boolean) as string[];

  for (const rel of required) {
    if (!files.has(rel)) {
      throw new ThemeZipError(`Missing file referenced by theme.json: ${rel}`);
    }
  }

  await ensureThemesRoot();
  const dir = themeDir(themeId);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });

  for (const entry of stripped) {
    const dest = path.join(dir, entry.name);
    if (!dest.startsWith(dir + path.sep) && dest !== dir) {
      throw new ThemeZipError(`Unsafe path: ${entry.name}`);
    }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, entry.data);
  }

  return manifest;
}
