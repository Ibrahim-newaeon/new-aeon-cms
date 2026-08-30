// lib/account/prefill.ts
import 'server-only';
import { currentCustomer } from '@/lib/auth/customer-session';
import { getDefaultAddress, getProfile } from './profile';

/**
 * What to put in the checkout form before the shopper types anything.
 *
 * Their default saved address if they have one, otherwise just their name and
 * phone from the account. Null when nobody is signed in — a guest checkout is
 * unchanged, which is the common case for a first order.
 */
export async function checkoutPrefill() {
  const session = await currentCustomer();
  if (!session) return null;

  const [address, profile] = await Promise.all([
    getDefaultAddress(session.sub),
    getProfile(session.sub),
  ]);

  if (address) {
    return {
      name: address.name,
      phone: address.phone,
      governorate: address.governorate,
      city: address.city,
      addressLine: address.addressLine,
      landmark: address.landmark,
    };
  }

  return profile ? { name: profile.name, phone: profile.phone } : null;
}
