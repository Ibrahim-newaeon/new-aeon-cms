// app/(admin)/admin/settings/page.tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/auth/session';
import { getSettings } from '@/lib/db/queries';
import { SettingsForm } from '@/components/admin/settings-form';
import type { ThemeMode } from '@/lib/theme/slots';
import { SeoReadiness } from '@/components/admin/seo-readiness';
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
    /*
     * Omitted here, these four are worse than merely blank. The form holds one
     * `value` object seeded from `initial` and submits the whole thing, so a
     * field missing from `initial` is submitted as undefined — and the route
     * writes undefined as null. Loading this page and saving ANY unrelated
     * setting would therefore erase a WhatsApp number that had been stored
     * correctly.
     *
     * allowAiCrawlers reads `!== false` in the form, so `?? true` keeps an
     * unset column meaning "allowed" instead of flipping it on first save.
     */
    brandAnswer: s?.brandAnswer ?? '',
    allowAiCrawlers: s?.allowAiCrawlers ?? true,
    whatsappNumber: s?.whatsappNumber ?? '',
    whatsappGreeting: s?.whatsappGreeting ?? '',
    analyticsId: s?.analyticsId ?? '',
    gtmId: s?.gtmId ?? '',
    ga4Id: s?.ga4Id ?? '',
    metaPixelId: s?.metaPixelId ?? '',
    tiktokPixelId: s?.tiktokPixelId ?? '',
    snapPixelId: s?.snapPixelId ?? '',
    announcementAr: s?.announcementAr ?? '',
    announcementEn: s?.announcementEn ?? '',
    announcementActive: s?.announcementActive ?? false,
    adminLogo: s?.adminLogo ?? '',
    adminAccent: s?.adminAccent ?? '',
    theme: s?.theme ?? {},
    themeDark: s?.themeDark ?? {},
    // 'light' rather than 'auto' for a site that predates the column: its one
    // saved theme is a light one, and defaulting to auto would hand a blank
    // dark stylesheet to every visitor whose device is dark.
    themeMode: (s?.themeMode as ThemeMode | null) ?? 'light',
    customCss: s?.customCss ?? '',
    htmlPasteMode: (s?.htmlPasteMode as SettingsInput['htmlPasteMode']) ?? 'safe',
    themeDriver: (s?.themeDriver as SettingsInput['themeDriver']) ?? 'builtin',
    comingSoonMode: s?.comingSoonMode ?? false,
    comingSoonMessage: s?.comingSoonMessage ?? '',
    eCommerceEnabled: s?.eCommerceEnabled ?? false,
    currency: s?.currency ?? 'JOD',
  };

  return <SettingsForm initial={initial} seoReadiness={<SeoReadiness />} />;
}
