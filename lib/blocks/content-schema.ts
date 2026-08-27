// lib/blocks/content-schema.ts
import { z } from 'zod';
import type { ContentBlock } from './types';

/**
 * Structural validation for a stored block array.
 *
 * Deliberately shallow: it guarantees every entry is an object carrying a known
 * `type`, which is what the renderer's switch depends on. Field-level checks
 * live with each block (see testimonial.ts) and run in the editor. Validating
 * all 30 variants deeply here would duplicate those schemas and reject
 * content authored before a field was added.
 */
const BLOCK_TYPES = [
  'heading', 'paragraph', 'rich-text', 'image', 'gallery', 'video', 'quote',
  'embed', 'button', 'divider', 'spacer', 'html', 'table', 'accordion', 'tabs',
  'cta', 'feature-grid', 'testimonial', 'team', 'stats', 'timeline',
  'comparison', 'pricing', 'map', 'contact-form', 'newsletter', 'social-links',
  'recent-posts', 'product-grid', 'custom',
] as const;

export const blockSchema = z
  .object({ type: z.enum(BLOCK_TYPES) })
  .passthrough();

export const blockArraySchema = z.array(blockSchema).max(200);

/** Narrowing cast used where Zod's passthrough output meets the column type. */
export function asContentBlocks(value: unknown): ContentBlock[] {
  const parsed = blockArraySchema.safeParse(value);
  return parsed.success ? (parsed.data as unknown as ContentBlock[]) : [];
}

export const translationSchema = z.object({
  locale: z.enum(['ar', 'en']),
  title: z.string().trim().min(1, 'العنوان مطلوب').max(255),
  excerpt: z.string().max(1000).optional(),
  body: blockArraySchema.optional(),
  metaTitle: z.string().max(255).optional(),
  metaDescription: z.string().max(500).optional(),
  ogImage: z.string().max(2048).optional(),
  noIndex: z.boolean().optional(),
});

export const contentPayloadSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, 'الرابط مطلوب')
    .max(255)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'الرابط يجب أن يحتوي أحرفاً صغيرة وأرقاماً وشرطات فقط'),
  status: z.enum(['draft', 'published', 'archived']),
  featuredImage: z.string().max(2048).optional(),
  translations: z.array(translationSchema).min(1),
  categoryIds: z.array(z.string().uuid()).max(20).optional(),
  tagIds: z.array(z.string().uuid()).max(50).optional(),
});

export type ContentPayload = z.infer<typeof contentPayloadSchema>;
export type TranslationPayload = z.infer<typeof translationSchema>;
