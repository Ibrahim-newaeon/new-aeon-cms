// app/(site)/[locale]/account/layout.tsx
import { notFound } from 'next/navigation';
import { commerceEnabled } from '@/lib/commerce/guard';
import { locales, type Locale } from '@/lib/env';

/**
 * The customer account area.
 *
 * Distinct from the admin's "Customers" list, which is the staff view of the
 * same people. This side is the shopper's own.
 */
export default async function AccountLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!locales.includes(locale as Locale)) notFound();
  if (!(await commerceEnabled())) notFound();
  return <>{children}</>;
}
