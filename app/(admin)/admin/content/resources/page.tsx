// app/(admin)/admin/content/resources/page.tsx
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { listContentByType } from '@/lib/content/list';
import { ContentTable } from '@/components/admin/content-table';
import { createTranslator } from '@/lib/admin-i18n';
import { getAdminLocale } from '@/lib/admin-i18n/server';

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';

export default async function ResourcesPage() {
  // The list follows the admin's own language, like the rest of the panel.
  // It was pinned to 'ar', so an English admin read English chrome above a
  // table of Arabic titles.
  const locale = await getAdminLocale();
  const t = createTranslator(locale);
  const rows = await listContentByType('resource', locale);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--admin-text)]">{t('resources.title')}</h1>
          <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{t('resources.subtitle')}</p>
        </div>
        <Link href={`${ADMIN_PATH}/content/resources/new`} className="admin-btn" data-test-id="resources-new">
          <Plus size={18} aria-hidden="true" />
          {t('resources.new')}
        </Link>
      </div>

      <ContentTable rows={rows} basePath={`${ADMIN_PATH}/content/resources`} />
    </div>
  );
}
