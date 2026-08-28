// components/admin/section-placeholder.tsx
import Link from 'next/link';
import { Construction } from 'lucide-react';
import { createTranslator } from '@/lib/admin-i18n';
import { getAdminLocale } from '@/lib/admin-i18n/server';

/**
 * Every sidebar entry needs a destination, otherwise the nav renders as
 * clickable and every click 404s. Sections without an implementation yet land
 * here — styled like the rest of the panel and explicit that they are not built,
 * rather than silently broken.
 */
export async function SectionPlaceholder({
  title,
  description,
  backHref,
}: {
  title: string;
  description: string;
  backHref: string;
}) {
  const t = createTranslator(await getAdminLocale());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--admin-text)]">{title}</h1>
        <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{description}</p>
      </div>

      <div className="admin-card flex flex-col items-center gap-3 py-16 text-center">
        <Construction size={28} aria-hidden="true" className="text-[var(--admin-accent)]" />
        <p className="text-sm text-[var(--admin-text-secondary)]">
          {t('common.notImplemented')}
        </p>
        <Link href={backHref} className="admin-btn-ghost mt-2">
          {t('common.back')}
        </Link>
      </div>
    </div>
  );
}
