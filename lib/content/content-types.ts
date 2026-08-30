// lib/content/content-types.ts

/**
 * The content types the admin has screens for.
 *
 * Declared once. This union was written out in four separate places, so adding
 * `resource` was four compile errors in four files — which is the good case.
 * The bad case is the one this codebase keeps producing: a list that drifts
 * because nothing forces the copies to agree.
 *
 * Note this is NOT the same thing as the `content_types` TABLE, which is data
 * and can hold rows the admin has no screens for. This is the set with routes.
 */
export const CONTENT_TYPE_SLUGS = ['page', 'post', 'resource'] as const;

export type ContentTypeSlug = (typeof CONTENT_TYPE_SLUGS)[number];
