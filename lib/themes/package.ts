// lib/themes/package.ts
// HTML theme pack manifest (theme.json) — marketing templates only for v1.

import { z } from 'zod';

export const THEME_TEMPLATE_KEYS = ['layout', 'home', 'page', 'post', 'blog'] as const;
export type ThemeTemplateKey = (typeof THEME_TEMPLATE_KEYS)[number];

const relativePath = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((p) => !p.startsWith('/') && !p.includes('..') && !p.includes('\\'), {
    message: 'Theme paths must be relative and must not contain ..',
  });

export const themeManifestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  version: z.string().trim().min(1).max(32),
  description: z.string().trim().max(500).optional(),
  templates: z
    .object({
      layout: relativePath,
      home: relativePath.optional(),
      page: relativePath.optional(),
      post: relativePath.optional(),
      blog: relativePath.optional(),
    })
    .strict(),
  partials: z.record(z.string(), relativePath).optional().default({}),
});

export type ThemeManifest = z.infer<typeof themeManifestSchema>;

/** Routes that never use an HTML pack — always builtin React. */
export const BUILTIN_ONLY_SEGMENTS = new Set([
  'shop',
  'products',
  'cart',
  'checkout',
  'account',
  'order',
  'bundles',
  'search',
  'category',
  'tag',
  'resources',
  'api',
  'setup',
  'coming-soon',
]);

export type ThemeableKind = 'home' | 'page' | 'post' | 'blog' | null;

/**
 * Map a public pathname to a theme template kind, or null if builtin-only /
 * not themable in v1.
 */
export function themeableKindForPath(pathname: string, locales: readonly string[]): ThemeableKind {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  const locale = parts[0];
  if (!locale || !locales.includes(locale)) return null;

  if (parts.length === 1) return 'home';

  const segment = parts[1];
  if (!segment || BUILTIN_ONLY_SEGMENTS.has(segment)) return null;

  if (segment === 'blog' && parts.length === 2) return 'blog';

  // /{locale}/{slug} — page or post (resolved later by content type)
  if (parts.length === 2) return 'page';

  // Custom type entries stay on builtin for v1 (no generic template yet)
  return null;
}
