// lib/commerce/guard.ts
import { getSettings } from '@/lib/db/queries';

/**
 * Every storefront commerce route calls this. Without it, disabling the module
 * in Settings would hide the menu but leave /shop and /products reachable by
 * URL — the same check ProductGridBlock already performs before querying.
 */
export async function commerceEnabled(): Promise<boolean> {
  const settings = await getSettings();
  return Boolean(settings?.eCommerceEnabled);
}
