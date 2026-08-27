// lib/commerce/phone.ts

/**
 * Canonicalises a Jordanian mobile number so one person cannot become two
 * customers.
 *
 * `+962 7 9123 4567`, `00962791234567`, `079 123 4567` and `0791234567` are the
 * same person. Without normalising, each spelling creates its own row and the
 * "what has this customer ordered before" question — the reason customers exist
 * at all — silently returns the wrong answer.
 *
 * Canonical form is the local `07XXXXXXXX`.
 */
export function normalisePhone(input: string): string {
  let digits = input.replace(/[^\d+]/g, '');

  if (digits.startsWith('+962')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('00962')) digits = `0${digits.slice(5)}`;
  else if (digits.startsWith('962')) digits = `0${digits.slice(3)}`;

  digits = digits.replace(/\D/g, '');

  // A bare 9-digit number starting 7 is missing its leading zero.
  if (digits.length === 9 && digits.startsWith('7')) digits = `0${digits}`;

  return digits;
}

/** Jordanian mobile: 07 followed by 7/8/9 and seven more digits. */
export function isValidJordanianMobile(input: string): boolean {
  return /^07[789]\d{7}$/.test(normalisePhone(input));
}

/** Jordan's twelve governorates. Fixed, because free text makes zone matching
 *  unreliable — a typo would fall through to "no zone" on every order. */
export const GOVERNORATES = [
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

export type GovernorateValue = (typeof GOVERNORATES)[number]['value'];

export function isGovernorate(v: string): v is GovernorateValue {
  return GOVERNORATES.some((g) => g.value === v);
}
