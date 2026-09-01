// app/(setup)/setup/page.tsx
import { redirect } from 'next/navigation';
import { needsSetup } from '@/lib/setup/status';
import { SetupForm } from '@/components/admin/setup-form';

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';

export const dynamic = 'force-dynamic';

/**
 * The wizard, shown only while no administrator exists.
 *
 * Closing it here is presentation, not protection — the real guarantee is the
 * conditional INSERT in lib/setup/install.ts. This redirect exists so a
 * configured site never SHOWS the form, which would invite someone to fill it
 * in and be refused.
 */
export default async function SetupPage() {
  if (!(await needsSetup())) redirect(ADMIN_PATH);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <SetupForm adminPath={ADMIN_PATH} />
    </main>
  );
}
