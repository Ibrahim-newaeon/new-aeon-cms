// app/(admin)/admin/content/types/page.tsx
import { listContentTypes } from '@/lib/content/types-admin';
import { ContentTypesManager } from '@/components/admin/content-types-manager';
import { createTranslator } from '@/lib/admin-i18n';
import { getAdminLocale } from '@/lib/admin-i18n/server';

export const dynamic = 'force-dynamic';

export default async function ContentTypesPage() {
  const t = createTranslator(await getAdminLocale());
  const types = await listContentTypes();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('types.title')}</h1>
        <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{t('types.subtitle')}</p>
      </div>
      <ContentTypesManager initial={types} />
    </div>
  );
}
