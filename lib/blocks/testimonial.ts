// lib/blocks/testimonial.ts
import { z } from 'zod';

/**
 * Accepts an absolute http(s) URL or a site-relative path (`/uploads/...`,
 * which is what the media library returns when UPLOAD_DIR is local).
 *
 * SECURITY: the explicit allow-list rejects `javascript:`, `data:` and
 * protocol-relative `//evil.com` URLs, so this value is safe to place in an
 * `src` attribute without further escaping.
 */
const mediaUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(
    (value) => /^https?:\/\//i.test(value) || (value.startsWith('/') && !value.startsWith('//')),
    { message: 'يجب أن يكون رابطاً كاملاً (http/https) أو مساراً يبدأ بـ /' }
  );

export const testimonialItemSchema = z.object({
  quote: z.string().trim().min(1, 'الاقتباس مطلوب').max(1000, 'الاقتباس طويل جداً'),
  author: z.string().trim().min(1, 'اسم صاحب الرأي مطلوب').max(120),
  role: z.string().trim().max(120).optional(),
  avatar: mediaUrlSchema.optional(),
  rating: z.number().int().min(1).max(5).optional(),
});

export const testimonialBlockSchema = z.object({
  type: z.literal('testimonial'),
  items: z
    .array(testimonialItemSchema)
    .min(1, 'أضف رأياً واحداً على الأقل')
    .max(24, 'الحد الأقصى 24 رأياً في الكتلة الواحدة'),
  columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(3),
});

export type TestimonialItemInput = z.infer<typeof testimonialItemSchema>;
export type TestimonialBlockInput = z.infer<typeof testimonialBlockSchema>;

/** Empty item used when the admin editor adds a new row. */
export const EMPTY_TESTIMONIAL_ITEM: TestimonialItemInput = {
  quote: '',
  author: '',
};

/**
 * Safe parse for the public renderer. Content authored before this block
 * existed — or hand-edited JSON — must never crash a published page, so the
 * renderer degrades to `null` instead of throwing.
 */
export function parseTestimonialBlock(input: unknown): TestimonialBlockInput | null {
  const result = testimonialBlockSchema.safeParse(input);
  return result.success ? result.data : null;
}
