// lib/commerce/live.ts
import { sql, type SQL } from 'drizzle-orm';

/**
 * What it means for a product to be LIVE.
 *
 * `is_active` is the shopkeeper's switch. This is the other half: a product is
 * only live if a visitor can actually READ it — which on a bilingual site means
 * a name in BOTH languages, not one.
 *
 * ── Why this is a hard rule and not a warning ───────────────────────────────
 * The storefront's name lookup falls back to the other locale when a
 * translation is missing, so an Arabic-only product did not look broken on the
 * English site: it appeared, priced and buyable, wearing an Arabic name. That
 * is worse than a gap, because nothing signals it. The catalogue had exactly
 * one such product and it took a manual audit to find.
 *
 * Enforced on the READ path rather than only at the point of saving, because
 * products arrive by spreadsheet import and by API as well as by the form, and
 * a rule that only one of those three honours is not a rule.
 *
 * The name is the criterion. A missing description is a quality problem the
 * Settings panel already reports; a missing NAME means the page cannot be
 * rendered in that language at all.
 */

/** The languages the storefront publishes. */
export const SITE_LOCALES = ['ar', 'en'] as const;

/**
 * Correlated against the `products` row in scope.
 *
 * `products.id` is written RAW, not interpolated. Drizzle emits an interpolated
 * column unqualified when only one table is in scope, which inside this
 * subquery would bind to product_i18n's own id and silently match everything —
 * the exact bug that once made every product render as its slug.
 */
export const isBilingual: SQL = sql`(
  select count(distinct i.locale) from product_i18n i
  where i.product_id = products.id
    and coalesce(trim(i.name), '') <> ''
) >= ${SITE_LOCALES.length}`;

/** Products a shopper is allowed to see, in any locale. */
export const liveProduct: SQL = sql`${sql.raw('products.is_active')} and ${isBilingual}`;
