// lib/themes/active.ts
import { desc, eq } from 'drizzle-orm';
import { cache } from 'react';
import { db } from '@/lib/db';
import { themes, settings } from '@/lib/db/schema';
import type { ThemeManifest } from './package';
import type { ThemeDriver } from '@/lib/theme/driver';

export type ActiveTheme = {
  id: string;
  name: string;
  version: string;
  manifest: ThemeManifest;
};

export const getActiveTheme = cache(async (): Promise<ActiveTheme | null> => {
  const [row] = await db
    .select()
    .from(themes)
    .where(eq(themes.isActive, true))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    manifest: row.manifest as ThemeManifest,
  };
});

export const getThemeDriver = cache(async (): Promise<ThemeDriver> => {
  const [row] = await db.select({ themeDriver: settings.themeDriver }).from(settings).limit(1);
  const driver = (row?.themeDriver as ThemeDriver | null) ?? 'builtin';
  return driver === 'html-pack' ? 'html-pack' : 'builtin';
});

/** html-pack only when driver says so AND a theme is active; else builtin. */
export const resolveStorefrontPresentation = cache(async () => {
  const driver = await getThemeDriver();
  if (driver !== 'html-pack') {
    return { driver: 'builtin' as const, theme: null };
  }
  const theme = await getActiveTheme();
  if (!theme) {
    return { driver: 'builtin' as const, theme: null };
  }
  return { driver: 'html-pack' as const, theme };
});

export async function listThemes() {
  return db.select().from(themes).orderBy(desc(themes.createdAt));
}

export async function activateTheme(id: string) {
  await db.transaction(async (tx) => {
    await tx.update(themes).set({ isActive: false });
    await tx
      .update(themes)
      .set({ isActive: true })
      .where(eq(themes.id, id));
    await tx
      .update(settings)
      .set({ themeDriver: 'html-pack', updatedAt: new Date() })
      .where(eq(settings.id, 1));
  });
}

export async function deactivateThemes() {
  await db.transaction(async (tx) => {
    await tx.update(themes).set({ isActive: false });
    await tx
      .update(settings)
      .set({ themeDriver: 'builtin', updatedAt: new Date() })
      .where(eq(settings.id, 1));
  });
}

export async function getThemeById(id: string) {
  const [row] = await db.select().from(themes).where(eq(themes.id, id)).limit(1);
  return row ?? null;
}

export async function deleteThemeRecord(id: string) {
  const row = await getThemeById(id);
  if (!row) return null;
  await db.delete(themes).where(eq(themes.id, id));
  if (row.isActive) {
    await db
      .update(settings)
      .set({ themeDriver: 'builtin', updatedAt: new Date() })
      .where(eq(settings.id, 1));
  }
  return row;
}
