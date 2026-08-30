// app/(site)/[locale]/account/addresses/page.tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentCustomer } from '@/lib/auth/customer-session';
import { listAddresses, wishlistCount } from '@/lib/account/profile';
import { getShippingRegions } from '@/lib/commerce/regions';
import { AccountNav } from '@/components/site/account-nav';
import { AddressBook } from '@/components/site/address-book';
import type { Locale } from '@/lib/env';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AddressesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = locale as Locale;
  const session = await currentCustomer();
  if (!session) redirect(`/${locale}/account`);

  const [rows, regions, saved] = await Promise.all([
    listAddresses(session.sub),
    getShippingRegions(),
    wishlistCount(session.sub),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="text-3xl font-bold text-site-ink">
        {typedLocale === 'ar' ? 'عناويني' : 'Addresses'}
      </h1>
      <div className="mt-8 mb-6">
        <AccountNav locale={typedLocale} current="addresses" wishlistCount={saved} />
      </div>
      <AddressBook
        locale={typedLocale}
        regions={regions}
        initial={rows.map((r) => ({
          id: r.id,
          label: r.label,
          name: r.name,
          phone: r.phone,
          governorate: r.governorate,
          city: r.city,
          addressLine: r.addressLine,
          landmark: r.landmark,
          isDefault: r.isDefault,
        }))}
      />
    </div>
  );
}
