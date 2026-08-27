// lib/money.ts

/**
 * Prices are stored as integers in the currency's MINOR unit — fils for JOD,
 * cents for USD. Integers, because floating-point money accumulates rounding
 * errors that show up as an order total that is one fils off.
 *
 * The previous helper hardcoded `/1000` and three decimals, which is right for
 * JOD (1 dinar = 1000 fils) and wrong for every 2-decimal currency: a store
 * switched to USD rendered 12900 cents as "$12.900" instead of "$129.00" — a
 * TENTH of the real price, i.e. selling at 90% off. Currency is user-
 * configurable in Settings, so the exponent has to come from the code.
 */
const MINOR_UNIT_EXPONENT: Record<string, number> = {
  // 3 decimals
  JOD: 3, KWD: 3, BHD: 3, OMR: 3, TND: 3, IQD: 3, LYD: 3,
  // 0 decimals
  JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0,
  // everything else defaults to 2 (USD, EUR, SAR, AED, EGP, GBP, …)
};

export function minorUnitExponent(currency: string): number {
  return MINOR_UNIT_EXPONENT[currency.toUpperCase()] ?? 2;
}

/** Minor units -> major units. 129000 fils -> 129 JOD; 12900 cents -> 129 USD. */
export function toMajorUnits(amount: number, currency: string): number {
  return amount / 10 ** minorUnitExponent(currency);
}

/** Major units -> minor units, for storing what an editor typed. */
export function toMinorUnits(amount: number, currency: string): number {
  return Math.round(amount * 10 ** minorUnitExponent(currency));
}

/**
 * Formats a stored price for display.
 *
 * `locale` is a real argument rather than a hardcoded 'ar-SA' — an English page
 * previously rendered prices with Arabic-Indic digits and Arabic currency
 * placement.
 */
export function formatPrice(
  amount: number,
  currency = 'JOD',
  locale: 'ar' | 'en' = 'ar'
): string {
  const digits = minorUnitExponent(currency);
  const intlLocale = locale === 'ar' ? 'ar-JO' : 'en-GB';

  try {
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(toMajorUnits(amount, currency));
  } catch {
    // An invalid ISO code from settings must not crash a product page.
    return `${toMajorUnits(amount, currency).toFixed(digits)} ${currency}`;
  }
}
