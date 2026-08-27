// app/(holding)/coming-soon/page.tsx
import { redirect } from 'next/navigation';
import { getSettings } from '@/lib/db/queries';
import { ComingSoon } from '@/components/site/coming-soon';
import { env } from '@/lib/env';

export default async function ComingSoonPage() {
  const settings = await getSettings();

  // If the flag is off, this URL should not linger as a dead end.
  if (!settings?.comingSoonMode) redirect(`/${env.DEFAULT_LOCALE}`);

  return <ComingSoon settings={settings} locale={env.DEFAULT_LOCALE} />;
}
