// app/api/users/[id]/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { users, auditLog } from '@/lib/db/schema';
import { and, eq, ne } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { hashPassword } from '@/lib/auth/password';
import { revokeAllUserTokens } from '@/lib/auth/rotation';
import { updateUserSchema, changePasswordSchema } from '@/lib/user-schema';

export const runtime = 'nodejs';

/**
 * Guards against locking everyone out of the panel.
 *
 * There is no recovery path — no password reset, no CLI — so an admin who
 * demotes, deactivates or deletes the last remaining admin bricks the install
 * and only direct SQL gets it back.
 */
async function wouldRemoveLastAdmin(targetId: string): Promise<boolean> {
  const target = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
  if (target[0]?.role !== 'admin') return false;

  const otherActiveAdmins = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.isActive, true), ne(users.id, targetId)))
    .limit(1);

  return !otherActiveAdmins[0];
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const data = updateUserSchema.parse(await request.json());

    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    const target = rows[0];
    if (!target) {
      return NextResponse.json({ success: false, error: { message: 'غير موجود' } }, { status: 404 });
    }

    const losingAdmin = data.role !== 'admin' || !data.isActive;

    if (losingAdmin && (await wouldRemoveLastAdmin(id))) {
      return NextResponse.json(
        { success: false, error: { message: 'لا يمكن إزالة آخر مدير عام نشط' } },
        { status: 409 }
      );
    }

    // Self-demotion is blocked even when other admins exist: it is almost
    // always a misclick, and the fix requires another admin to undo it.
    if (id === auth.user.sub && losingAdmin) {
      return NextResponse.json(
        { success: false, error: { message: 'لا يمكنك تغيير صلاحيات حسابك أو تعطيله' } },
        { status: 409 }
      );
    }

    await db
      .update(users)
      .set({ name: data.name, role: data.role, isActive: data.isActive, updatedAt: new Date() })
      .where(eq(users.id, id));

    // A role change or deactivation must not wait 15 minutes to take effect —
    // the access token already issued still carries the old role.
    if (target.role !== data.role || target.isActive !== data.isActive) {
      await revokeAllUserTokens(id);
    }

    await db.insert(auditLog).values({
      userId: auth.user.sub,
      action: 'user.update',
      entityType: 'user',
      entityId: id,
      payload: { role: data.role, isActive: data.isActive },
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: request.headers.get('user-agent') ?? null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: 'Validation failed', issues: error.issues } },
        { status: 400 }
      );
    }
    console.error('User update error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Internal server error' } },
      { status: 500 }
    );
  }
}

/** Sets a new password. Separate from PATCH so a profile edit can never carry one. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const { password } = changePasswordSchema.parse(await request.json());

    const rows = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    if (!rows[0]) {
      return NextResponse.json({ success: false, error: { message: 'غير موجود' } }, { status: 404 });
    }

    await db
      .update(users)
      .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
      .where(eq(users.id, id));

    // Any session opened with the old password is now suspect.
    await revokeAllUserTokens(id);

    await db.insert(auditLog).values({
      userId: auth.user.sub,
      action: 'user.password_change',
      entityType: 'user',
      entityId: id,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: request.headers.get('user-agent') ?? null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: error.issues[0]?.message ?? 'Validation failed' } },
        { status: 400 }
      );
    }
    console.error('Password change error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Internal server error' } },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;

    if (id === auth.user.sub) {
      return NextResponse.json(
        { success: false, error: { message: 'لا يمكنك حذف حسابك' } },
        { status: 409 }
      );
    }

    if (await wouldRemoveLastAdmin(id)) {
      return NextResponse.json(
        { success: false, error: { message: 'لا يمكن حذف آخر مدير عام نشط' } },
        { status: 409 }
      );
    }

    // content.authorId is ON DELETE unset? No — it has no rule, so deleting an
    // author would leave content pointing at a missing user. Deactivating keeps
    // authorship intact and is reversible; a hard delete is not offered.
    await db.update(users).set({ isActive: false, updatedAt: new Date() }).where(eq(users.id, id));
    await revokeAllUserTokens(id);

    await db.insert(auditLog).values({
      userId: auth.user.sub,
      action: 'user.deactivate',
      entityType: 'user',
      entityId: id,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: request.headers.get('user-agent') ?? null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('User deactivate error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'تعذّر التعطيل' } },
      { status: 500 }
    );
  }
}
