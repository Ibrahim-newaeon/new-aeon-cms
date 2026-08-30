// lib/blocks/content-schema.ts
import { z } from 'zod';
import { ALL_BLOCK_TYPES, type BlockType } from './defaults';
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
/**
 * Derived, not restated.
 *
 * This was a second hand-written list of the 30 block types, and the two drifted
 * the moment one was added. The failure was silent and total: an unrecognised
 * type fails the array parse, and asContentBlocks used to return [] for the
 * whole body — one unknown block erased an entire page.
 */
const BLOCK_TYPES = ALL_BLOCK_TYPES as [BlockType, ...BlockType[]];

export const blockSchema = z
  .object({ type: z.enum(BLOCK_TYPES) })
  .passthrough();

export const blockArraySchema = z.array(blockSchema).max(200);

/**
 * Reading stored content, which is a different job from validating a save.
 *
 * Per entry, not all-or-nothing. A body written by a newer deploy — or hand
 * edited, or restored from an older dump — can contain a type this build does
 * not know, and blanking the entire page over one bad block turns a cosmetic
 * gap into a blank page. Unknown entries are dropped and the rest renders; the
 * renderer's default arm already handles anything that slips through.
 *
 * Writes stay strict: translationSchema below uses blockArraySchema directly,
 * so the API still rejects a bad block instead of quietly discarding it.
 */
export function asContentBlocks(value: unknown): ContentBlock[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => blockSchema.safeParse(entry).success) as ContentBlock[];
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
