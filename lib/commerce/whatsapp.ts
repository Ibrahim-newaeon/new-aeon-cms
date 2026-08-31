// lib/commerce/whatsapp.ts
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { DEFAULT_COUNTRY } from './phone';

/**
 * wa.me links.
 *
 * For a cash-on-delivery shop in Jordan most orders begin as a message, so the
 * distance between "looking at a product" and "asking about it" is worth
 * closing. This is a plain anchor — no widget script, no third-party
 * JavaScript, nothing loaded from another origin. It costs nothing in
 * performance or privacy, and it works with JavaScript disabled.
 */

/**
 * wa.me wants digits only: no +, no spaces, no dashes.
 *
 * Parsed rather than stripped, because "079 123 4567" is what a shop owner
 * types into a settings field and the digits alone are not a phone number
 * WhatsApp can route — it needs the country code. Returns null rather than a
 * broken link, so the caller can hide the button instead of showing one that
 * opens an error.
 */
export function waNumber(input: string | null | undefined, country: CountryCode = DEFAULT_COUNTRY): string | null {
  if (!input?.trim()) return null;
  const parsed = parsePhoneNumberFromString(input.trim(), country);
  if (!parsed?.isValid()) return null;
  // .number is E.164 (+962…); wa.me takes it without the plus.
  return parsed.number.replace(/^\+/, '');
}

export interface WhatsAppLinkInput {
  phone: string | null | undefined;
  country?: CountryCode;
  /** The message the chat opens with. Left blank for no prefill. */
  message?: string | null;
}

/** The full https://wa.me/… URL, or null when there is no usable number. */
export function whatsappLink(input: WhatsAppLinkInput): string | null {
  const number = waNumber(input.phone, input.country);
  if (!number) return null;

  const text = input.message?.trim();
  // encodeURIComponent, not a query builder: wa.me expects the message under
  // `text` percent-encoded, and URLSearchParams would turn spaces into `+`,
  // which arrives in the chat as literal plus signs.
  return text
    ? `https://wa.me/${number}?text=${encodeURIComponent(text)}`
    : `https://wa.me/${number}`;
}

/**
 * What the shopper's first message says when they tap through from a product.
 *
 * Includes the SKU and the URL because the person on the other end needs to
 * know which of fifty near-identical packages is being asked about — "do you
 * have this in stock?" with no reference is a message that costs two more to
 * resolve.
 */
export function productEnquiry(
  locale: 'ar' | 'en',
  product: { name: string; sku?: string | null; url: string }
): string {
  const reference = product.sku ? `${product.name} (${product.sku})` : product.name;

  return locale === 'ar'
    ? `مرحباً، أود الاستفسار عن: ${reference}\n${product.url}`
    : `Hello, I'd like to ask about: ${reference}\n${product.url}`;
}
