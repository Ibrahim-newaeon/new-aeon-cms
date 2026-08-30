// app/(site)/[locale]/account/profile/page.tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentCustomer } from '@/lib/auth/customer-session';
import { getProfile, wishlistCount } from '@/lib/account/profile';
import { AccountNav } from '@/components/site/account-nav';
import { ProfileForm } from '@/components/site/profile-form';
import { formatPhone } from '@/lib/commerce/phone';
import type { Locale } from '@/lib/env';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = locale as Locale;
  const session = await currentCustomer();
  if (!session) redirect(`/${locale}/account`);

  const [profile, saved] = await Promise.all([
    getProfile(session.sub),
    wishlistCount(session.sub),
  ]);
  if (!profile) redirect(`/${locale}/account`);

  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="text-3xl font-bold text-site-ink">
        {typedLocale === 'ar' ? 'بياناتي' : 'My details'}
      </h1>
      <div className="mt-8 mb-6">
        <AccountNav locale={typedLocale} current="profile" wishlistCount={saved} />
      </div>
      <ProfileForm
        locale={typedLocale}
        initial={{
          name: profile.name,
          email: profile.email,
          phone: formatPhone(profile.phone),
          hasPassword: profile.hasPassword,
        }}
      />
    </div>
  );
}
