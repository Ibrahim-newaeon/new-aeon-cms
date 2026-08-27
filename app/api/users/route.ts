// app/api/users/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { users, auditLog } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { hashPassword } from '@/lib/auth/password';
import { createUserSchema } from '@/lib/user-schema';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, ['admin']);
  if (!auth.ok) return auth.response;

  // passwordHash is deliberately not selected — it should never leave the DB.
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
    .from(users);

  return NextResponse.json({ success: true, data: rows });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, ['admin']);
  if (!auth.ok) return auth.response;

  try {
    const data = createUserSchema.parse(await request.json());

    const clash = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (clash[0]) {
      return NextResponse.json(
        { success: false, error: { message: 'هذا البريد مستخدم بالفعل' } },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(data.password);

    const [row] = await db
      .insert(users)
      .values({
        email: data.email,
        name: data.name,
        role: data.role,
        isActive: data.isActive,
        passwordHash,
      })
      .returning({ id: users.id, email: users.email });

    if (!row) throw new Error('insert returned no row');

    await db.insert(auditLog).values({
      userId: auth.user.sub,
      action: 'user.create',
      entityType: 'user',
      entityId: row.id,
      payload: { email: row.email, role: data.role },
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: request.headers.get('user-agent') ?? null,
    });

    return NextResponse.json({ success: true, data: { id: row.id } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: 'Validation failed', issues: error.issues } },
        { status: 400 }
      );
    }
    console.error('User create error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Internal server error' } },
      { status: 500 }
    );
  }
}
