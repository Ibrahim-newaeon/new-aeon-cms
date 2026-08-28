import { db } from '@/lib/db';
import { auditLog, users } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { createTranslator, type MessageKey } from '@/lib/admin-i18n';
import { getAdminLocale } from '@/lib/admin-i18n/server';

export async function ActivityFeed() {
  const locale = await getAdminLocale();
  const t = createTranslator(locale);

  const activities = await db.select({
    id: auditLog.id,
    action: auditLog.action,
    entityType: auditLog.entityType,
    createdAt: auditLog.createdAt,
    userName: users.name,
  })
  .from(auditLog)
  .leftJoin(users, eq(auditLog.userId, users.id))
  .orderBy(desc(auditLog.createdAt))
  .limit(10);

  // Audit-log action -> message key. Unknown actions fall through to the raw
  // action string rather than rendering blank.
  const actionKeys: Record<string, MessageKey> = {
    'content.created': 'activity.contentCreated',
    'content.updated': 'activity.contentUpdated',
    'content.published': 'activity.contentPublished',
    'media.uploaded': 'activity.mediaUploaded',
    'user.login': 'activity.userLogin',
  };
  const actionLabel = (action: string) =>
    actionKeys[action] ? t(actionKeys[action]) : action;

  return (
    <div className="admin-card">
      <h2 className="text-lg font-semibold mb-4">{t('activity.title')}</h2>
      <div className="space-y-3">
        {activities.length === 0 ? (
          <p className="text-[var(--admin-text-muted)] text-sm">{t('activity.empty')}</p>
        ) : (
          activities.map((activity) => (
            <div key={activity.id} className="flex items-start gap-3 py-2">
              <div className="w-8 h-8 rounded-full bg-[var(--admin-primary-muted)] flex items-center justify-center shrink-0">
                <span className="text-xs text-[var(--admin-primary)]">
                  {(activity.userName || 'S').charAt(0)}
                </span>
              </div>
              <div>
                <p className="text-sm">
                  <span className="font-medium">{activity.userName || 'System'}</span>
                  {' '}
                  {actionLabel(activity.action)}
                </p>
                <p className="text-xs text-[var(--admin-text-muted)]">
                  {activity.createdAt ? new Date(activity.createdAt).toLocaleDateString(locale === 'ar' ? 'ar-JO' : 'en-GB') : ''}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
