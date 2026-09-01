// lib/setup/countries.ts

/**
 * The countries offered at setup, each with the currency it normally trades in.
 *
 * Country is not cosmetic here. `normalisePhone(phone, getStoreCountry())` runs
 * in customers.ts, checkout.ts and order-access.ts, and the E.164 result is the
 * MERGE KEY for a customer record. Get the country wrong and a local number
 * like 05xxxxxxxx resolves to the wrong dialling code — two different shoppers
 * can collapse onto one record, or a perfectly valid number is rejected at
 * checkout. It used to default silently to Jordan with nothing on screen saying
 * so, which is fine for one client and wrong for the next.
 *
 * Currency travels with it because the pair is almost always predictable, and a
 * shop priced in JOD while shipping to Riyadh is a mistake nobody notices until
 * an order arrives. It stays editable: plenty of shops price in USD regardless
 * of where they are.
 *
 * Not a complete ISO list. A 240-entry select is worse than a short one for a
 * product sold in this region, and anything missing can be set in Settings.
 */

export interface SetupCountry {
  code: string;
  currency: string;
  en: string;
  ar: string;
}

export const SETUP_COUNTRIES: readonly SetupCountry[] = [
  { code: 'JO', currency: 'JOD', en: 'Jordan',               ar: 'الأردن' },
  { code: 'SA', currency: 'SAR', en: 'Saudi Arabia',         ar: 'السعودية' },
  { code: 'AE', currency: 'AED', en: 'United Arab Emirates', ar: 'الإمارات' },
  { code: 'KW', currency: 'KWD', en: 'Kuwait',               ar: 'الكويت' },
  { code: 'QA', currency: 'QAR', en: 'Qatar',                ar: 'قطر' },
  { code: 'BH', currency: 'BHD', en: 'Bahrain',              ar: 'البحرين' },
  { code: 'OM', currency: 'OMR', en: 'Oman',                 ar: 'عُمان' },
  { code: 'EG', currency: 'EGP', en: 'Egypt',                ar: 'مصر' },
  { code: 'IQ', currency: 'IQD', en: 'Iraq',                 ar: 'العراق' },
  { code: 'LB', currency: 'LBP', en: 'Lebanon',              ar: 'لبنان' },
  { code: 'PS', currency: 'ILS', en: 'Palestine',            ar: 'فلسطين' },
  { code: 'SY', currency: 'SYP', en: 'Syria',                ar: 'سوريا' },
  { code: 'YE', currency: 'YER', en: 'Yemen',                ar: 'اليمن' },
  { code: 'MA', currency: 'MAD', en: 'Morocco',              ar: 'المغرب' },
  { code: 'TN', currency: 'TND', en: 'Tunisia',              ar: 'تونس' },
  { code: 'DZ', currency: 'DZD', en: 'Algeria',              ar: 'الجزائر' },
  { code: 'LY', currency: 'LYD', en: 'Libya',                ar: 'ليبيا' },
  { code: 'SD', currency: 'SDG', en: 'Sudan',                ar: 'السودان' },
  { code: 'TR', currency: 'TRY', en: 'Türkiye',              ar: 'تركيا' },
  { code: 'GB', currency: 'GBP', en: 'United Kingdom',       ar: 'المملكة المتحدة' },
  { code: 'US', currency: 'USD', en: 'United States',        ar: 'الولايات المتحدة' },
] as const;

export const DEFAULT_SETUP_COUNTRY = 'JO';

export function currencyFor(code: string): string {
  return SETUP_COUNTRIES.find((c) => c.code === code)?.currency ?? 'JOD';
}
