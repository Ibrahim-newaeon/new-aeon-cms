// lib/content/type-registry.ts
import { CONTENT_TYPE_SLUGS, type ContentTypeSlug } from './content-types';

/**
 * Content types a person can create from the admin.
 *
 * The `content_types` TABLE has always existed and always accepted rows. What
 * it could not do was give a new type a URL: /[locale]/[slug] already catches
 * everything, so a "Case study" type had rows, an editor, and nowhere to live.
 * A type now carries a route prefix, and one dynamic route resolves it.
 *
 * The whole risk is that prefix. Every segment below is a real route in
 * app/(site)/[locale], and Next resolves a static segment ahead of a dynamic
 * one — so a type at prefix "shop" would not break the store, it would simply
 * never resolve, and the editor would be left wondering where their pages
 * went. Refusing the name up front is the difference between an error message
 * and a mystery.
 */

/** Live route segments under /[locale]. Keep in step with the filesystem. */
export const RESERVED_PREFIXES = [
  'blog',
  'bundles',
  'cart',
  'category',
  'checkout',
  'order',
  'products',
  'resources',
  'search',
  'shop',
  'tag',
] as const;

/**
 * Words that are not routes today but would be confusing or dangerous as one.
 * `api` and `_next` never reach this router; the rest are reserved because a
 * public page at that address would look like part of the system.
 */
export const RESERVED_WORDS = [
  'api', '_next', 'admin', 'login', 'logout', 'sitemap.xml', 'robots.txt',
  'uploads', 'assets', 'static',
] as const;

export const PREFIX_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The form a prefix is stored and routed in.
 *
 * Callers MUST store this, not the raw input. Validation lowercases before it
 * checks anything, so `Case-Studies` passes — and storing the raw value then
 * gives a type whose prefix can never match a URL, because the route arrives
 * lowercase. Normalising in one exported place is what stops the check and the
 * write disagreeing.
 */
export function normalisePrefix(raw: string): string {
  return raw.trim().toLowerCase();
}

export type PrefixProblem =
  | { kind: 'empty' }
  | { kind: 'shape' }
  | { kind: 'tooLong' }
  | { kind: 'reserved'; word: string }
  | { kind: 'locale' }
  | { kind: 'taken'; word: string };

/**
 * Why a prefix cannot be used, or null if it can.
 *
 * Returns the REASON rather than a boolean, so the admin can say which word is
 * taken instead of "invalid".
 */
export function prefixProblem(
  raw: string,
  locales: readonly string[],
  takenPrefixes: readonly string[] = []
): PrefixProblem | null {
  const value = normalisePrefix(raw);

  if (!value) return { kind: 'empty' };
  if (value.length > 64) return { kind: 'tooLong' };
  if (!PREFIX_PATTERN.test(value)) return { kind: 'shape' };

  // A prefix equal to a locale would produce /ar/ar/thing and shadow the
  // locale segment itself.
  if (locales.includes(value)) return { kind: 'locale' };

  if ((RESERVED_PREFIXES as readonly string[]).includes(value)) {
    return { kind: 'reserved', word: value };
  }
  if ((RESERVED_WORDS as readonly string[]).includes(value)) {
    return { kind: 'reserved', word: value };
  }
  // The built-in types own their own screens; a custom type must not claim one.
  if ((CONTENT_TYPE_SLUGS as readonly string[]).includes(value)) {
    return { kind: 'reserved', word: value };
  }
  if (takenPrefixes.map((p) => p.toLowerCase()).includes(value)) {
    return { kind: 'taken', word: value };
  }

  return null;
}

export function isBuiltInType(slug: string): slug is ContentTypeSlug {
  return (CONTENT_TYPE_SLUGS as readonly string[]).includes(slug);
}
