// lib/commerce/bundle-schema.ts
import { z } from 'zod';
import { slugSchema } from '@/lib/taxonomy-schema';

/**
 * Lives in lib, not in the route: a Next route file may only export request
 * handlers and a fixed set of config values, so exporting a schema from one
 * fails the build with a type error about OmitWithTag.
 */
export const bundleSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional(),
  /**
   * A FIXED total in minor units, not a percentage off the parts. A computed
   * discount means a later price change to any component silently changes what
   * the bundle costs, and the shop finds out from a customer.
   */
  price: z.number().int().min(0),
  image: z.string().trim().max(500).optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  items: z
    .array(z.object({ variantId: z.string().uuid(), qty: z.number().int().min(1).max(99) }))
    .min(1, 'الحزمة تحتاج عنصراً واحداً على الأقل'),
});

export type BundleInput = z.infer<typeof bundleSchema>;
