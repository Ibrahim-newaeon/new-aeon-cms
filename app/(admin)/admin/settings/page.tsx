// app/(admin)/admin/settings/page.tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/auth/session';
import { getSettings } from '@/lib/db/queries';
import { SettingsForm } from '@/components/admin/settings-form';
import type { SettingsInput, SocialPlatform } from '@/lib/settings-schema';
import { createTranslator } from '@/lib/admin-i18n';
import { getAdminLocale } from '@/lib/admin-i18n/server';

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';

export default async function SettingsPage() {
  const t = createTranslator(await getAdminLocale());
  // The API guard is admin-only; mirror that here so editors are not shown a
  // form whose every save would 403.
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;
  if (!token) redirect(`${ADMIN_PATH}/login`);

  let role: string | null = null;
  try {
    role = (await verifyAccessToken(token)).role;
  } catch {
    redirect(`${ADMIN_PATH}/login`);
  }

  if (role !== 'admin') {
    return (
      <div className="admin-card py-16 text-center">
        <p className="text-sm text-[var(--admin-text-secondary)]">
          {t('settings.adminOnly')}
        </p>
      </div>
    );
  }

  const s = await getSettings();

  const initial: SettingsInput = {
    siteName: s?.siteName ?? 'New Aeon',
    siteDescription: s?.siteDescription ?? '',
    logo: s?.logo ?? '',
    favicon: s?.favicon ?? '',
    contactEmail: s?.contactEmail ?? '',
    contactPhone: s?.contactPhone ?? '',
    socialLinks: (s?.socialLinks as Partial<Record<SocialPlatform, string>>) ?? {},
    analyticsId: s?.analyticsId ?? '',
    gtmId: s?.gtmId ?? '',
    ga4Id: s?.ga4Id ?? '',
    metaPixelId: s?.metaPixelId ?? '',
    tiktokPixelId: s?.tiktokPixelId ?? '',
    snapPixelId: s?.snapPixelId ?? '',
    customCss: s?.customCss ?? '',
    comingSoonMode: s?.comingSoonMode ?? false,
    comingSoonMessage: s?.comingSoonMessage ?? '',
    eCommerceEnabled: s?.eCommerceEnabled ?? false,
    currency: s?.currency ?? 'JOD',
  };

  return <SettingsForm initial={initial} />;
}
