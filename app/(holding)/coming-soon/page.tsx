// app/(holding)/coming-soon/page.tsx
import { redirect } from 'next/navigation';
import { getSettings } from '@/lib/db/queries';
import { ComingSoon } from '@/components/site/coming-soon';
import { env } from '@/lib/env';

/**
 * Never prerendered.
 *
 * This page reads live settings — the coming-soon flag itself, the logo, the
 * message — so a build-time snapshot would be wrong the moment an editor
 * changed any of them, and the flag would keep serving its old value. It also
 * made `next build` require a reachable database, which broke the Docker
 * build: there is no database during `docker build`.
 */
export const dynamic = 'force-dynamic';

export default async function ComingSoonPage() {
  const settings = await getSettings();

  // If the flag is off, this URL should not linger as a dead end.
  if (!settings?.comingSoonMode) redirect(`/${env.DEFAULT_LOCALE}`);

  return <ComingSoon settings={settings} locale={env.DEFAULT_LOCALE} />;
}
