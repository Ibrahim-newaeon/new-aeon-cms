// app/(admin)/admin/users/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { asc } from 'drizzle-orm';
import { verifyAccessToken } from '@/lib/auth/session';
import { UsersManager, type UserRow } from '@/components/admin/users-manager';
import type { UserRole } from '@/lib/user-schema';

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';

export default async function UsersPage() {
  // Mirror the API guard: the endpoints are admin-only, so an editor should not
  // be shown a screen where every action would 403.
  const store = await cookies();
  const token = store.get('access_token')?.value;
  if (!token) redirect(`${ADMIN_PATH}/login`);

  let me: { sub: string; role: string } | null = null;
  try {
    const payload = await verifyAccessToken(token);
    me = { sub: payload.sub, role: payload.role };
  } catch {
    redirect(`${ADMIN_PATH}/login`);
  }

  if (!me || me.role !== 'admin') {
    return (
      <div className="admin-card py-16 text-center">
        <p className="text-sm text-[var(--admin-text-secondary)]">
          هذه الصفحة متاحة لمدير النظام فقط.
        </p>
      </div>
    );
  }

  // passwordHash is never selected — it must not reach the client bundle.
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.email));

  const initial: UserRow[] = rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    role: (r.role ?? 'editor') as UserRole,
    isActive: r.isActive ?? true,
    lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
    createdAt: r.createdAt ? r.createdAt.toISOString() : null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--admin-text)]">الأدمن والصلاحيات</h1>
        <p className="mt-1 text-sm text-[var(--admin-text-muted)]">
          حسابات المشرفين وأدوارهم. الحسابات تُعطَّل ولا تُحذف، للحفاظ على نسبة المحتوى لكاتبه.
        </p>
      </div>

      <UsersManager initial={initial} currentUserId={me.sub} />
    </div>
  );
}
