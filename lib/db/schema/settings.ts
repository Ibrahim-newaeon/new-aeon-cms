// lib/db/schema/settings.ts
import {
  pgTable, uuid, varchar, text, integer, boolean,
  timestamp, jsonb
} from 'drizzle-orm/pg-core';
import type { Theme } from '../../theme/slots';
import type { ShippingRegion } from '../../commerce/phone';

// ─── SETTINGS ─────────────────────────────────────────────

export const settings = pgTable('settings', {
  id: integer('id').primaryKey().default(1),
  siteName: varchar('site_name', { length: 255 }).default('New Aeon'),
  siteDescription: text('site_description'),
  logo: text('logo'),
  favicon: text('favicon'),
  contactEmail: varchar('contact_email', { length: 255 }),
  contactPhone: varchar('contact_phone', { length: 50 }),
  socialLinks: jsonb('social_links'),
  analyticsId: varchar('analytics_id', { length: 255 }),
  gtmId: varchar('gtm_id', { length: 255 }),
  ga4Id: varchar('ga4_id', { length: 255 }),
  metaPixelId: varchar('meta_pixel_id', { length: 255 }),
  tiktokPixelId: varchar('tiktok_pixel_id', { length: 255 }),
  snapPixelId: varchar('snap_pixel_id', { length: 255 }),
  /**
   * The storefront theme: a validated map of design slots to hex colours.
   * jsonb rather than a column per slot, so adding a slot is a code change and
   * not a migration. Validated by lib/theme/slots.ts on the way in — it is
   * emitted into a <style> tag, so it is never free-form CSS.
   */
  theme: jsonb('theme').$type<Theme>(),
  /**
   * The dark half of the same skin. Null means this site has no dark variant,
   * and themeMode is then effectively 'light' whatever it says — a site with
   * no dark colours must not be served an empty dark stylesheet.
   */
  themeDark: jsonb('theme_dark').$type<Theme>(),
  /**
   * Which of the two a visitor gets: 'light', 'dark', or 'auto' to follow the
   * visitor's own device setting. Defaults to 'light' so an existing site,
   * whose theme column is its only theme, keeps rendering exactly as before.
   */
  themeMode: varchar('theme_mode', { length: 5 }).default('light'),
  /**
   * The admin panel's own brand. Separate from `logo` because the storefront
   * logo is designed for a light page and the sidebar is near-black — the
   * supplied mark here is #130c0e, i.e. invisible on it. A client needs to
   * upload a light variant, and that is a different asset, not a setting.
   */
  /**
   * A promo strip above the navbar: "delivery across Jordan · gift wrapping".
   *
   * Two columns rather than one, because the site is bilingual and a single
   * string would show Arabic copy to English readers. Two rather than jsonb
   * because it is two short strings with no structure — greppable, and
   * validated by the same rules as any other text field.
   *
   * The toggle is separate from the text so turning the bar off for a week does
   * not mean retyping it afterwards.
   */
  announcementAr: text('announcement_ar'),
  announcementEn: text('announcement_en'),
  announcementActive: boolean('announcement_active').default(false),
  adminLogo: text('admin_logo'),
  /** One hex colour. The admin's greys are structure, not brand. */
  adminAccent: varchar('admin_accent', { length: 7 }),
  customCss: text('custom_css'),
  /**
   * Paste-HTML sanitiser tier for `html` blocks: safe | designer | trusted.
   * Default safe = pre-v2 behaviour.
   */
  htmlPasteMode: varchar('html_paste_mode', { length: 16 }).default('safe'),
  /**
   * Storefront driver: builtin (React) or html-pack (uploaded theme zip).
   */
  themeDriver: varchar('theme_driver', { length: 16 }).default('builtin'),
  comingSoonMode: boolean('coming_soon_mode').default(false),
  comingSoonMessage: text('coming_soon_message'),
  eCommerceEnabled: boolean('ecommerce_enabled').default(false),
  currency: varchar('currency', { length: 3 }).default('JOD'),
  /**
   * ISO 3166-1 alpha-2. Decides what a bare local phone number means: `079…`
   * is a Jordanian mobile and something else entirely elsewhere, so without
   * this a two-country shop would merge two different people onto one customer.
   */
  countryCode: varchar('country_code', { length: 2 }).default('JO'),
  /**
   * The storefront's primary language — the one a visitor to `/` is sent to,
   * and the one hreflang advertises as x-default.
   *
   * NULLABLE on purpose, and null is not the same as 'ar'. The setup wizard has
   * always asked for this, but until now nothing stored the answer and every
   * reader fell back to the DEFAULT_LOCALE environment variable, so choosing
   * English produced an Arabic site. Existing installs have no row value and
   * must keep obeying their env var exactly as before; only a site that has
   * actually chosen one overrides it. See getDefaultLocale().
   */
  defaultLocale: varchar('default_locale', { length: 5 }),
  /**
   * Where this store ships, as [{ value, ar, en }].
   *
   * Was a hardcoded list of Jordan's twelve governorates — correct for exactly
   * one country. The reason it was a fixed list still holds: the checkout
   * dropdown and the shipping zone editor must offer the SAME values or a zone
   * matches nothing and every order in it falls through to "no zone". They now
   * read this one list rather than sharing a constant.
   */
  shippingRegions: jsonb('shipping_regions').$type<ShippingRegion[]>(),
  /**
   * Two sentences a language model can lift verbatim: who this shop is, where,
   * and what it sells.
   *
   * Separate from siteDescription, which is the meta description a search
   * engine truncates at ~155 characters. This one is written to be QUOTED, and
   * it is the single most valuable field for being cited by an answer engine —
   * which is also why it is a field rather than something inferred: nobody but
   * the shop can write it.
   */
  brandAnswer: text('brand_answer'),
  /**
   * Whether AI crawlers may read the site.
   *
   * Default TRUE, which is also what robots.txt already did by accident — the
   * `*` rule matched GPTBot and the rest. The value of making it explicit is
   * the ability to say NO for a client who does not want their content in a
   * training set, which was previously impossible without editing code.
   */
  allowAiCrawlers: boolean('allow_ai_crawlers').default(true),
  /**
   * The number the chat button opens. Separate from contactPhone: a shop's
   * WhatsApp is often a different line from the one on the invoice, and
   * quietly reusing the wrong one sends customers to a phone nobody watches.
   */
  whatsappNumber: varchar('whatsapp_number', { length: 32 }),
  /** Opening line. Blank means the chat opens empty, which is fine. */
  whatsappGreeting: text('whatsapp_greeting'),
  updatedAt: timestamp('updated_at').defaultNow(),
});
