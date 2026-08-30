// lib/commerce/regions.ts
import { getSettings } from '@/lib/db/queries';
import {
  JORDAN_GOVERNORATES, DEFAULT_COUNTRY, isCountryCode,
  type ShippingRegion,
} from './phone';
import type { CountryCode } from 'libphonenumber-js';

/**
 * The one list the checkout form and the shipping-zone editor both read.
 *
 * Falls back to Jordan's twelve governorates when a store has not configured
 * anything, so an existing shop keeps working unchanged and a new one starts
 * with a sensible list rather than an empty dropdown that makes checkout
 * impossible.
 */
export async function getShippingRegions(): Promise<ShippingRegion[]> {
  const settings = await getSettings();
  const configured = settings?.shippingRegions;
  return Array.isArray(configured) && configured.length > 0
    ? configured
    : [...JORDAN_GOVERNORATES];
}

/** The store's country, for interpreting bare local phone numbers. */
export async function getStoreCountry(): Promise<CountryCode> {
  const settings = await getSettings();
  const code = settings?.countryCode?.toUpperCase();
  return code && isCountryCode(code) ? code : DEFAULT_COUNTRY;
}
