// lib/settings-schema.ts
import { z } from 'zod';
import { themeSchema } from './theme/slots';

const SOCIAL_PLATFORMS = [
  'facebook',
  'instagram',
  'twitter',
  'linkedin',
  'youtube',
  'tiktok',
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export const socialPlatforms: ReadonlyArray<SocialPlatform> = SOCIAL_PLATFORMS;

/** Absolute URL or site-relative path; blocks javascript:/data: schemes. */
const assetUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (v) => v === '' || /^https?:\/\//i.test(v) || (v.startsWith('/') && !v.startsWith('//')),
    'يجب أن يكون رابطاً كاملاً أو مساراً يبدأ بـ /'
  );

/**
 * Tracking IDs are interpolated into script tags by the public layout, so they
 * are restricted to the character set real IDs use. Without this a "tracking
 * ID" of `"></script><script>…` would be a stored XSS.
 */
const trackingId = z
  .string()
  .trim()
  .max(255)
  .regex(/^[A-Za-z0-9_-]*$/, 'معرّف غير صالح — أحرف وأرقام وشرطات فقط');

export const settingsSchema = z.object({
  siteName: z.string().trim().min(1, 'اسم الموقع مطلوب').max(255),
  siteDescription: z.string().trim().max(1000).optional(),
  logo: assetUrl.optional(),
  favicon: assetUrl.optional(),
  contactEmail: z.union([z.literal(''), z.string().email('بريد غير صالح').max(255)]).optional(),
  contactPhone: z.string().trim().max(50).optional(),
  socialLinks: z.record(z.enum(SOCIAL_PLATFORMS), assetUrl).optional(),

  analyticsId: trackingId.optional(),
  gtmId: trackingId.optional(),
  ga4Id: trackingId.optional(),
  metaPixelId: trackingId.optional(),
  tiktokPixelId: trackingId.optional(),
  // Snap pixel IDs are UUIDs; the hyphens are already allowed by trackingId.
  snapPixelId: trackingId.optional(),

  // Injected into a <style> tag, so it must not be able to close it.
  /** Strict: an unknown slot is rejected, not stored and ignored. */
  theme: themeSchema.optional(),
  customCss: z
    .string()
    .max(20000, 'CSS طويل جداً')
    .refine((v) => !/<\/?\s*style/i.test(v), 'لا يُسمح بوسوم <style> داخل الحقل')
    .optional(),

  comingSoonMode: z.boolean(),
  comingSoonMessage: z.string().trim().max(500).optional(),

  eCommerceEnabled: z.boolean(),
  currency: z
    .string()
    .trim()
    .length(3, 'رمز العملة من 3 أحرف')
    .regex(/^[A-Z]{3}$/, 'استخدم رمز ISO مثل JOD'),
});

export type SettingsInput = z.infer<typeof settingsSchema>;
