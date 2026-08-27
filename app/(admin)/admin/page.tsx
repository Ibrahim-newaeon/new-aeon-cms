// app/(admin)/admin/page.tsx
import { Suspense } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { StatCard } from '@/components/admin/stat-card';
import { db } from '@/lib/db';
import { content, contentI18n, mediaAssets, formSubmissions } from '@/lib/db/schema';
import { count, eq, and, desc } from 'drizzle-orm';
import { getSettings } from '@/lib/db/queries';

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';

export default async function AdminDashboard() {
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
          مرحباً بك في لوحة {siteName}
        </h1>
        <p className="mt-1 text-sm text-[var(--admin-text-muted)]">
          تحكم بكل شيء من مكان واحد — الصفحات، المقالات، والوسائط.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="إجمالي المحتوى"
          value={totals[0]?.count ?? 0}
          icon="file-text"
          href={`${ADMIN_PATH}/content/pages`}
        />
        <StatCard
          title="منشور"
          value={published[0]?.count ?? 0}
          icon="check-circle"
          href={`${ADMIN_PATH}/content/pages`}
        />
        <StatCard title="مسودة" value={drafts[0]?.count ?? 0} icon="edit" />
        <StatCard
          title="الوسائط"
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
            الرسائل غير المقروءة
          </h2>
          {(unreadForms[0]?.count ?? 0) === 0 ? (
            <p className="text-sm text-[var(--admin-text-muted)]">لا توجد رسائل جديدة.</p>
          ) : (
            <Link
              href={`${ADMIN_PATH}/forms`}
              className="text-sm text-[var(--admin-accent-soft)] hover:underline"
            >
              لديك <span dir="ltr">{unreadForms[0]?.count}</span> رسالة غير مقروءة
            </Link>
          )}
        </div>
      </div>

      <div className="admin-card">
        <h2 className="mb-3 font-medium">اختصارات سريعة</h2>
        <div className="flex flex-wrap gap-2">
          <Link href={`${ADMIN_PATH}/content/pages/new`} className="admin-btn">
            إضافة صفحة
          </Link>
          <Link href={`${ADMIN_PATH}/navigation`} className="admin-btn-ghost">
            تعديل الواجهة الرئيسية
          </Link>
          <Link href={`${ADMIN_PATH}/settings`} className="admin-btn-ghost">
            إعدادات الموقع
          </Link>
        </div>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<'draft' | 'published' | 'archived', string> = {
  published: 'منشور',
  draft: 'مسودة',
  archived: 'مؤرشف',
};

async function RecentContent() {
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
      <h2 className="mb-3 font-medium">آخر المحتوى</h2>

      {recent.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--admin-text-muted)]">
          لا يوجد محتوى بعد
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
