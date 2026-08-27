// lib/taxonomy-schema.ts
import { z } from 'zod';

/** Lowercase, digits, single hyphens — the same rule content slugs use. */
export const slugSchema = z
  .string()
  .trim()
  .min(1, 'الرابط مطلوب')
  .max(255)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'أحرف صغيرة وأرقام وشرطات فقط');

export const categorySchema = z.object({
  slug: slugSchema,
  parentId: z.string().uuid().nullable().optional(),
  icon: z.string().trim().max(255).optional(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
  translations: z
    .array(
      z.object({
        locale: z.enum(['ar', 'en']),
        name: z.string().trim().min(1, 'الاسم مطلوب').max(255),
        description: z.string().trim().max(1000).optional(),
      })
    )
    .min(1, 'أدخل اسماً للغة واحدة على الأقل'),
});

export const tagSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1, 'الاسم مطلوب').max(255),
});

export type CategoryInput = z.infer<typeof categorySchema>;
export type TagInput = z.infer<typeof tagSchema>;

/**
 * Derives a slug from a name. Arabic has no Latin transliteration here, so an
 * Arabic-only name yields an empty slug and the author has to type one — which
 * is why the slug field stays editable rather than being auto-filled silently.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 255);
}
