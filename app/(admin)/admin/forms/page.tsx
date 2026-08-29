// app/(admin)/admin/forms/page.tsx
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { formSubmissions } from '@/lib/db/schema';
import { and, count, desc, eq, isNull, isNotNull } from 'drizzle-orm';
import { verifyAccessToken } from '@/lib/auth/session';
import { createTranslator } from '@/lib/admin-i18n';
import { getAdminLocale } from '@/lib/admin-i18n/server';
import { FormsManager, type SubmissionRow } from '@/components/admin/forms-manager';

export const dynamic = 'force-dynamic';

export default async function FormsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; archived?: string }>;
}) {
  const params = await searchParams;
  const locale = await getAdminLocale();
  const t = createTranslator(locale);

  const type = params.type === 'newsletter' ? 'newsletter' : 'contact';
  const showArchived = params.archived === '1';

  // Only an admin may delete outright; an editor archives instead.
  let canDelete = false;
  try {
    const token = (await cookies()).get('access_token')?.value;
    if (token) canDelete = (await verifyAccessToken(token)).role === 'admin';
  } catch {
    canDelete = false;
  }

  // Newsletter signups are a list, never a queue, so the archive filter only
  // applies to messages.
  const where =
    type === 'newsletter'
      ? eq(formSubmissions.type, 'newsletter')
      : and(
          eq(formSubmissions.type, 'contact'),
          showArchived
            ? isNotNull(formSubmissions.archivedAt)
            : isNull(formSubmissions.archivedAt)
        );

  const [rows, unread] = await Promise.all([
    db
      .select()
      .from(formSubmissions)
      .where(where)
      .orderBy(desc(formSubmissions.createdAt))
      .limit(200),
    db
      .select({ value: count() })
      .from(formSubmissions)
      .where(
        and(
          eq(formSubmissions.type, 'contact'),
          eq(formSubmissions.isRead, false),
          isNull(formSubmissions.archivedAt)
        )
      ),
  ]);

  // Dates cross to a Client Component, so they travel as ISO strings.
  const initial: SubmissionRow[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    payload: r.payload ?? {},
    pageSlug: r.pageSlug,
    locale: r.locale,
    isRead: r.isRead ?? false,
    archivedAt: r.archivedAt?.toISOString() ?? null,
    createdAt: r.createdAt?.toISOString() ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--admin-text)]">{t('forms.title')}</h1>
        <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{t('forms.subtitle')}</p>
      </div>

      <FormsManager
        rows={initial}
        type={type}
        showArchived={showArchived}
        unreadCount={unread[0]?.value ?? 0}
        canDelete={canDelete}
      />
    </div>
  );
}
