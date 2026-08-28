// app/(admin)/admin/forms/page.tsx
import { db } from '@/lib/db';
import { formSubmissions } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { createTranslator, type MessageKey } from '@/lib/admin-i18n';
import { getAdminLocale } from '@/lib/admin-i18n/server';

const TYPE_KEY: Record<'contact' | 'newsletter', MessageKey> = {
  contact: 'forms.typeContact',
  newsletter: 'forms.typeNewsletter',
};

export default async function FormsPage() {
  const locale = await getAdminLocale();
  const t = createTranslator(locale);
  const rows = await db
    .select()
    .from(formSubmissions)
    .orderBy(desc(formSubmissions.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--admin-text)]">{t('forms.title')}</h1>
        <p className="mt-1 text-sm text-[var(--admin-text-muted)]">
          {t('forms.subtitle')}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="admin-card py-16 text-center text-sm text-[var(--admin-text-muted)]">
          {t('forms.empty')}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="admin-card flex flex-wrap items-start justify-between gap-4 py-4"
              data-test-id={`form-row-${row.id}`}
            >
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium">
                  {t(TYPE_KEY[row.type])}
                  {!row.isRead && (
                    <span className="ms-2 rounded-full bg-[var(--admin-accent-muted)] px-2 py-0.5 text-[10px] text-[var(--admin-accent-soft)]">
                      {t('forms.new')}
                    </span>
                  )}
                </p>
                <dl className="text-xs text-[var(--admin-text-secondary)]">
                  {Object.entries(row.payload ?? {}).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <dt className="text-[var(--admin-text-muted)]">{k}:</dt>
                      <dd dir="auto" className="truncate">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <time className="shrink-0 text-xs text-[var(--admin-text-muted)]" dir="ltr">
                {row.createdAt ? new Date(row.createdAt).toLocaleString(locale === 'ar' ? 'ar-JO' : 'en-GB') : '—'}
              </time>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
