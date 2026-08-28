// app/(admin)/admin/page.tsx
import { Suspense } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { StatCard } from '@/components/admin/stat-card';
import { db } from '@/lib/db';
import { content, contentI18n, mediaAssets, formSubmissions } from '@/lib/db/schema';
import { count, eq, and, desc } from 'drizzle-orm';
import { getSettings } from '@/lib/db/queries';
import { createTranslator } from '@/lib/admin-i18n';
import { getAdminLocale } from '@/lib/admin-i18n/server';

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';

export default async function AdminDashboard() {
  const t = createTranslator(await getAdminLocale());
  const [settings, totals, published, drafts, media, unreadForms] = await Promise.all([
    getSettings(),
    db.select({ count: count() }).from(content),
    db.select({ count: count() }).from(content).where(eq(content.status, 'published')),
    db.select({ count: count() }).from(content).where(eq(content.status, 'draft')),
    db.select({ count: count() }).from(mediaAssets),
    db.select({ count: count() }).from(formSubmissions).where(eq(formSubmissions.isRead, false)),
  ]);

  const siteName = settings?.siteName ?? 'New Aeon';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--admin-text)]">
          {t('dashboard.welcome', { site: siteName })}
        </h1>
        <p className="mt-1 text-sm text-[var(--admin-text-muted)]">
          {t('dashboard.subtitle')}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={t('dashboard.totalContent')}
          value={totals[0]?.count ?? 0}
          icon="file-text"
          href={`${ADMIN_PATH}/content/pages`}
        />
        <StatCard
          title={t('dashboard.published')}
          value={published[0]?.count ?? 0}
          icon="check-circle"
          href={`${ADMIN_PATH}/content/pages`}
        />
        <StatCard title={t('dashboard.draft')} value={drafts[0]?.count ?? 0} icon="edit" />
        <StatCard
          title={t('dashboard.media')}
          value={media[0]?.count ?? 0}
          icon="image"
          href={`${ADMIN_PATH}/media`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Suspense fallback={<div className="admin-card h-64 animate-pulse" />}>
          <RecentContent />
        </Suspense>

        <div className="admin-card">
          <h2 className="mb-3 flex items-center gap-2 font-medium">
            <AlertTriangle size={16} aria-hidden="true" className="text-[var(--admin-accent)]" />
            {t('dashboard.unread')}
          </h2>
          {(unreadForms[0]?.count ?? 0) === 0 ? (
            <p className="text-sm text-[var(--admin-text-muted)]">{t('dashboard.noUnread')}</p>
          ) : (
            <Link
              href={`${ADMIN_PATH}/forms`}
              className="text-sm text-[var(--admin-accent-soft)] hover:underline"
            >
              {t('dashboard.unreadCount', { count: unreadForms[0]?.count ?? 0 })}
            </Link>
          )}
        </div>
      </div>

      <div className="admin-card">
        <h2 className="mb-3 font-medium">{t('dashboard.shortcuts')}</h2>
        <div className="flex flex-wrap gap-2">
          <Link href={`${ADMIN_PATH}/content/pages/new`} className="admin-btn">
            {t('dashboard.addPage')}
          </Link>
          <Link href={`${ADMIN_PATH}/navigation`} className="admin-btn-ghost">
            {t('dashboard.editFront')}
          </Link>
          <Link href={`${ADMIN_PATH}/settings`} className="admin-btn-ghost">
            {t('dashboard.siteSettings')}
          </Link>
        </div>
      </div>
    </div>
  );
}

async function RecentContent() {
  const t = createTranslator(await getAdminLocale());

  // Inside the component so it can reach the translator.
  const STATUS_LABEL: Record<'draft' | 'published' | 'archived', string> = {
    published: t('status.published'),
    draft: t('status.draft'),
    archived: t('status.archived'),
  };

  const recent = await db
    .select({ content, i18n: contentI18n })
    .from(content)
    .leftJoin(
      contentI18n,
      and(eq(content.id, contentI18n.contentId), eq(contentI18n.locale, 'ar'))
    )
    .orderBy(desc(content.createdAt))
    .limit(5);

  return (
    <div className="admin-card" data-test-id="recent-content">
      <h2 className="mb-3 font-medium">{t('dashboard.recent')}</h2>

      {recent.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--admin-text-muted)]">
          {t('dashboard.noContent')}
        </p>
      ) : (
        <div className="space-y-2">
          {recent.map((item) => {
            const status = item.content.status ?? 'draft';
            return (
              <Link
                key={item.content.id}
                href={`${ADMIN_PATH}/content/pages/${item.content.id}/edit`}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-bg)] p-3 transition-colors hover:border-[var(--admin-accent)]/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.i18n?.title || '—'}</p>
                  <p className="truncate text-xs text-[var(--admin-text-muted)]" dir="ltr">
                    {item.content.slug}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-[var(--admin-accent-soft)]">
                  {STATUS_LABEL[status]}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
