// app/api/navigation/[id]/route.ts
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { navigation, navigationI18n } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { navItemSchema } from '@/lib/navigation-schema';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const data = navItemSchema.parse(await request.json());

    if (data.parentId === id) {
      return NextResponse.json(
        { success: false, error: { message: 'لا يمكن أن يكون العنصر أباً لنفسه' } },
        { status: 400 }
      );
    }

    await db
      .update(navigation)
      .set({
        label: data.label,
        url: data.url,
        location: data.location,
        parentId: data.parentId ?? null,
        order: data.order,
        isActive: data.isActive,
        openInNew: data.openInNew,
      })
      .where(eq(navigation.id, id));

    for (const t of data.translations ?? []) {
      const found = await db
        .select({ id: navigationI18n.id })
        .from(navigationI18n)
        .where(and(eq(navigationI18n.navigationId, id), eq(navigationI18n.locale, t.locale)))
        .limit(1);

      const existing = found[0];

      if (!t.label.trim()) {
        // Clearing a translation should fall back to navigation.label, not
        // store an empty string that renders as a blank menu item.
        if (existing) await db.delete(navigationI18n).where(eq(navigationI18n.id, existing.id));
        continue;
      }

      if (existing) {
        await db.update(navigationI18n).set({ label: t.label }).where(eq(navigationI18n.id, existing.id));
      } else {
        await db.insert(navigationI18n).values({ navigationId: id, locale: t.locale, label: t.label });
      }
    }

    revalidatePath('/', 'layout');
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: 'Validation failed', issues: error.issues } },
        { status: 400 }
      );
    }
    console.error('Navigation update error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Internal server error' } },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;

    // navigation.parentId has no ON DELETE rule, so children would be orphaned.
    // Promoting them to top level is friendlier than refusing the delete for a
    // menu, where the hierarchy is presentational rather than meaningful.
    await db.update(navigation).set({ parentId: null }).where(eq(navigation.parentId, id));

    await db.delete(navigationI18n).where(eq(navigationI18n.navigationId, id));
    await db.delete(navigation).where(eq(navigation.id, id));

    revalidatePath('/', 'layout');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Navigation delete error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'تعذّر الحذف' } },
      { status: 500 }
    );
  }
}
