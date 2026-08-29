// app/api/forms/[id]/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { formSubmissions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';

export const runtime = 'nodejs';

const patchSchema = z.object({
  isRead: z.boolean().optional(),
  archived: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const body = patchSchema.parse(await request.json());

    const patch: Partial<typeof formSubmissions.$inferInsert> = {};
    if (body.isRead !== undefined) patch.isRead = body.isRead;
    // Archiving is a timestamp rather than a flag, so "when did this leave the
    // queue" is answerable later without a second column.
    if (body.archived !== undefined) patch.archivedAt = body.archived ? new Date() : null;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: true });
    }

    const updated = await db
      .update(formSubmissions)
      .set(patch)
      .where(eq(formSubmissions.id, id))
      .returning({ id: formSubmissions.id });

    if (updated.length === 0) {
      return NextResponse.json({ success: false, error: { message: 'غير موجود' } }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: { message: 'قيمة غير صالحة' } }, { status: 400 });
    }
    console.error('Form submission update error:', error);
    return NextResponse.json({ success: false, error: { message: 'تعذّر التحديث' } }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // admin only: archiving is the reversible action an editor gets; deleting a
  // customer's message outright is not.
  const auth = await requireApiAuth(request, ['admin']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    await db.delete(formSubmissions).where(eq(formSubmissions.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Form submission delete error:', error);
    return NextResponse.json({ success: false, error: { message: 'تعذّر الحذف' } }, { status: 500 });
  }
}
