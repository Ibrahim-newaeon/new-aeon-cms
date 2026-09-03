// lib/setup/regions.ts
import { JORDAN_GOVERNORATES, type ShippingRegion } from '@/lib/commerce/phone';

/**
 * The delivery regions a store starts with, chosen by the country picked at
 * setup.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Everything downstream of setup assumed Jordan. `getShippingRegions()` falls
 * back to JORDAN_GOVERNORATES when a store has configured nothing, and the
 * wizard configured nothing — so a shop in Riyadh opened its checkout offering
 * Amman, Irbid and Zarqa, and the demo shipping zone covered four Jordanian
 * governorates whatever the operator had chosen a step earlier. The country
 * question was already being asked; only the answer was being ignored.
 *
 * ── Why not every country has a list ────────────────────────────────────────
 * These are first-level administrative divisions, and they have to match what
 * the shop actually uses at checkout: the dropdown and the shipping-zone editor
 * read the SAME list, so a region invented here is a zone that matches no
 * order. Where a country's divisions are short, stable and unambiguous — the
 * GCC, plus Jordan's existing twelve — they are listed. Everywhere else the
 * store starts with a single nationwide region.
 *
 * A one-entry list is not a failure state. It is a working shop with one
 * delivery area, which is what most new stores are, and Settings can split it
 * later. Guessing at 27 governorates and getting three of them wrong would be
 * worse: the errors surface as orders that fall through to "no zone".
 *
 * Adding a country is additive — a new entry here, nothing else to change.
 */

const NATIONWIDE: readonly ShippingRegion[] = [
  { value: 'nationwide', ar: 'جميع المناطق', en: 'Nationwide' },
] as const;

const REGIONS_BY_COUNTRY: Record<string, readonly ShippingRegion[]> = {
  JO: JORDAN_GOVERNORATES,

  SA: [
    { value: 'riyadh',           ar: 'الرياض',            en: 'Riyadh' },
    { value: 'makkah',           ar: 'مكة المكرمة',       en: 'Makkah' },
    { value: 'madinah',          ar: 'المدينة المنورة',   en: 'Madinah' },
    { value: 'eastern-province', ar: 'المنطقة الشرقية',   en: 'Eastern Province' },
    { value: 'qassim',           ar: 'القصيم',            en: 'Qassim' },
    { value: 'asir',             ar: 'عسير',              en: 'Asir' },
    { value: 'tabuk',            ar: 'تبوك',              en: 'Tabuk' },
    { value: 'hail',             ar: 'حائل',              en: 'Hail' },
    { value: 'northern-borders', ar: 'الحدود الشمالية',   en: 'Northern Borders' },
    { value: 'jazan',            ar: 'جازان',             en: 'Jazan' },
    { value: 'najran',           ar: 'نجران',             en: 'Najran' },
    { value: 'al-bahah',         ar: 'الباحة',            en: 'Al Bahah' },
    { value: 'al-jawf',          ar: 'الجوف',             en: 'Al Jawf' },
  ],

  AE: [
    { value: 'abu-dhabi',      ar: 'أبوظبي',      en: 'Abu Dhabi' },
    { value: 'dubai',          ar: 'دبي',         en: 'Dubai' },
    { value: 'sharjah',        ar: 'الشارقة',     en: 'Sharjah' },
    { value: 'ajman',          ar: 'عجمان',       en: 'Ajman' },
    { value: 'umm-al-quwain',  ar: 'أم القيوين',  en: 'Umm Al Quwain' },
    { value: 'ras-al-khaimah', ar: 'رأس الخيمة',  en: 'Ras Al Khaimah' },
    { value: 'fujairah',       ar: 'الفجيرة',     en: 'Fujairah' },
  ],

  KW: [
    { value: 'al-asimah',         ar: 'العاصمة',        en: 'Al Asimah' },
    { value: 'hawalli',           ar: 'حولي',           en: 'Hawalli' },
    { value: 'farwaniya',         ar: 'الفروانية',      en: 'Farwaniya' },
    { value: 'mubarak-al-kabeer', ar: 'مبارك الكبير',   en: 'Mubarak Al-Kabeer' },
    { value: 'ahmadi',            ar: 'الأحمدي',        en: 'Ahmadi' },
    { value: 'jahra',             ar: 'الجهراء',        en: 'Jahra' },
  ],

  QA: [
    { value: 'doha',         ar: 'الدوحة',    en: 'Doha' },
    { value: 'al-rayyan',    ar: 'الريان',    en: 'Al Rayyan' },
    { value: 'al-wakrah',    ar: 'الوكرة',    en: 'Al Wakrah' },
    { value: 'al-daayen',    ar: 'الضعاين',   en: 'Al Daayen' },
    { value: 'umm-salal',    ar: 'أم صلال',   en: 'Umm Salal' },
    { value: 'al-khor',      ar: 'الخور',     en: 'Al Khor' },
    { value: 'al-shamal',    ar: 'الشمال',    en: 'Al Shamal' },
    { value: 'al-shahaniya', ar: 'الشحانية',  en: 'Al Shahaniya' },
  ],

  BH: [
    { value: 'capital',   ar: 'العاصمة',   en: 'Capital' },
    { value: 'muharraq',  ar: 'المحرق',    en: 'Muharraq' },
    { value: 'northern',  ar: 'الشمالية',  en: 'Northern' },
    { value: 'southern',  ar: 'الجنوبية',  en: 'Southern' },
  ],

  OM: [
    { value: 'muscat',            ar: 'مسقط',           en: 'Muscat' },
    { value: 'dhofar',            ar: 'ظفار',           en: 'Dhofar' },
    { value: 'musandam',          ar: 'مسندم',          en: 'Musandam' },
    { value: 'al-buraimi',        ar: 'البريمي',        en: 'Al Buraimi' },
    { value: 'ad-dakhiliyah',     ar: 'الداخلية',       en: 'Ad Dakhiliyah' },
    { value: 'north-al-batinah',  ar: 'شمال الباطنة',   en: 'North Al Batinah' },
    { value: 'south-al-batinah',  ar: 'جنوب الباطنة',   en: 'South Al Batinah' },
    { value: 'north-al-sharqiyah', ar: 'شمال الشرقية',  en: 'North Ash Sharqiyah' },
    { value: 'south-al-sharqiyah', ar: 'جنوب الشرقية',  en: 'South Ash Sharqiyah' },
    { value: 'ad-dhahirah',       ar: 'الظاهرة',        en: 'Ad Dhahirah' },
    { value: 'al-wusta',          ar: 'الوسطى',         en: 'Al Wusta' },
  ],
};

/** The starting delivery regions for a store in `countryCode`. */
export function regionsFor(countryCode: string): ShippingRegion[] {
  return [...(REGIONS_BY_COUNTRY[countryCode.toUpperCase()] ?? NATIONWIDE)];
}

/**
 * Whether this country got a real list or the nationwide placeholder. The
 * demo zone reads it to decide whether "covers everywhere" means one region or
 * a handful — and it is the honest thing to show an operator later.
 */
export function hasRegionList(countryCode: string): boolean {
  return countryCode.toUpperCase() in REGIONS_BY_COUNTRY;
}
