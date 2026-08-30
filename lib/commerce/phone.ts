// lib/commerce/phone.ts
import {
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';

/**
 * Phone numbers, canonicalised so one person cannot become two customers.
 *
 * The canonical form is E.164 — `+962791234567`. It was the local Jordanian
 * `0791234567`, which is unambiguous only while every customer is Jordanian:
 * `079…` is a mobile in Jordan and something else entirely elsewhere, so a
 * shop selling to two countries would merge two different people onto one
 * customer row. E.164 carries the country in the value itself.
 *
 * This value is the merge key for customers AND half the one-review-per-person
 * key, so what counts as "the same number" is decided here and nowhere else.
 *
 * Parsing is libphonenumber-js rather than a regex per country. Hand-rolled
 * patterns get the easy countries right and quietly reject real numbers in the
 * rest, and a shop cannot tell the difference until a customer complains that
 * checkout will not take their number.
 */

/** Where a bare local number is assumed to come from when nothing says otherwise. */
export const DEFAULT_COUNTRY: CountryCode = 'JO';

export function isCountryCode(v: string): v is CountryCode {
  return /^[A-Z]{2}$/.test(v);
}

/**
 * Canonical E.164, or '' when the input is not a phone number at all.
 *
 * Returning '' rather than throwing is deliberate: callers use this to LOOK UP
 * a customer, and an unparseable string should find nobody, not blow up a
 * checkout.
 */
export function normalisePhone(input: string, country: CountryCode = DEFAULT_COUNTRY): string {
  if (!input?.trim()) return '';
  const parsed = parsePhoneNumberFromString(input.trim(), country);
  return parsed?.isValid() ? parsed.number : '';
}

/**
 * A number a courier can actually call.
 *
 * Mobile-or-unknown rather than mobile-only: in several countries the ranges
 * overlap and libphonenumber reports FIXED_LINE_OR_MOBILE, and rejecting those
 * would turn away real customers.
 */
export function isValidMobile(input: string, country: CountryCode = DEFAULT_COUNTRY): boolean {
  if (!input?.trim()) return false;
  const parsed = parsePhoneNumberFromString(input.trim(), country);
  if (!parsed?.isValid()) return false;

  const type = parsed.getType();
  return type === undefined || type === 'MOBILE' || type === 'FIXED_LINE_OR_MOBILE';
}

/** For display: `+962 7 9123 4567`. Never store this — store the E.164 form. */
export function formatPhone(input: string, country: CountryCode = DEFAULT_COUNTRY): string {
  const parsed = parsePhoneNumberFromString(input.trim(), country);
  return parsed?.isValid() ? parsed.formatInternational() : input;
}

/**
 * A place an order can be shipped to.
 *
 * Was a hardcoded list of Jordan's twelve governorates. It is now configured
 * per store, because the twelve are correct for exactly one country — but the
 * reason the list was fixed still holds: the checkout dropdown and the shipping
 * zone editor MUST offer the same values, or a zone matches nothing and every
 * order in it silently falls through to "no zone". They now read one list
 * instead of sharing a constant.
 */
export interface ShippingRegion {
  value: string;
  ar: string;
  en: string;
}

/** The default list for a Jordanian store, and what existing shops keep. */
export const JORDAN_GOVERNORATES: readonly ShippingRegion[] = [
  { value: 'amman', ar: 'العاصمة — عمّان', en: 'Amman' },
  { value: 'irbid', ar: 'إربد', en: 'Irbid' },
  { value: 'zarqa', ar: 'الزرقاء', en: 'Zarqa' },
  { value: 'balqa', ar: 'البلقاء', en: 'Balqa' },
  { value: 'madaba', ar: 'مادبا', en: 'Madaba' },
  { value: 'mafraq', ar: 'المفرق', en: 'Mafraq' },
  { value: 'jerash', ar: 'جرش', en: 'Jerash' },
  { value: 'ajloun', ar: 'عجلون', en: 'Ajloun' },
  { value: 'karak', ar: 'الكرك', en: 'Karak' },
  { value: 'tafilah', ar: 'الطفيلة', en: 'Tafilah' },
  { value: 'maan', ar: 'معان', en: "Ma'an" },
  { value: 'aqaba', ar: 'العقبة', en: 'Aqaba' },
] as const;

/**
 * Kept as an alias so the twelve governorates stay importable by their old
 * name. New code should read the store's configured regions instead.
 *
 * @deprecated Use the regions from settings — see getShippingRegions().
 */
export const GOVERNORATES = JORDAN_GOVERNORATES;

/** A region value is valid if the store offers it. */
export function isRegionOf(regions: readonly ShippingRegion[], v: string): boolean {
  return regions.some((r) => r.value === v);
}

/** Slug-safe, because these values end up in a zone definition and a form. */
export function isRegionValue(v: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) && v.length <= 64;
}
