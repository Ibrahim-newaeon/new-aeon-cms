// lib/navigation-schema.ts
import { z } from 'zod';

export const navLocations = ['header', 'footer', 'sidebar', 'mobile'] as const;
export type NavLocation = (typeof navLocations)[number];

/**
 * Menu URLs render straight into an href, so the scheme allow-list matters:
 * a stored `javascript:` link would execute for every visitor on every page.
 * Relative paths are the normal case; absolute http(s) covers external links.
 */
const navUrl = z
  .string()
  .trim()
  .min(1, 'الرابط مطلوب')
  .max(500)
  .refine(
    (v) =>
      /^https?:\/\//i.test(v) ||
      /^(mailto|tel):/i.test(v) ||
      (v.startsWith('/') && !v.startsWith('//')) ||
      v.startsWith('#'),
    'استخدم http/https أو مساراً يبدأ بـ /'
  );

export const navItemSchema = z.object({
  label: z.string().trim().min(1, 'الاسم المرجعي مطلوب').max(255),
  url: navUrl,
  location: z.enum(navLocations),
  parentId: z.string().uuid().nullable().optional(),
  order: z.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
  openInNew: z.boolean().default(false),
  translations: z
    .array(
      z.object({
        locale: z.enum(['ar', 'en']),
        label: z.string().trim().max(255),
      })
    )
    .optional(),
});

export const reorderSchema = z.object({
  location: z.enum(navLocations),
  ids: z.array(z.string().uuid()).max(200),
});

export type NavItemInput = z.infer<typeof navItemSchema>;
