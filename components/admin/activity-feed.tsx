import { db } from '@/lib/db';
import { auditLog, users } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';

export async function ActivityFeed() {
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

  const actionLabels: Record<string, string> = {
    'content.created': 'أضاف محتوى جديد',
    'content.updated': 'عدّل محتوى',
    'content.published': 'نشر محتوى',
    'media.uploaded': 'رفع ملف',
    'user.login': 'سجل دخول',
  };

  return (
    <div className="admin-card">
      <h2 className="text-lg font-semibold mb-4">النشاط الأخير</h2>
      <div className="space-y-3">
        {activities.length === 0 ? (
          <p className="text-[var(--admin-text-muted)] text-sm">لا يوجد نشاط حديث</p>
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
                  {actionLabels[activity.action] || activity.action}
                </p>
                <p className="text-xs text-[var(--admin-text-muted)]">
                  {activity.createdAt ? new Date(activity.createdAt).toLocaleDateString('ar-SA') : ''}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
