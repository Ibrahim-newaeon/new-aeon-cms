// app/api/navigation/route.ts
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { navigation, navigationI18n } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { navItemSchema, reorderSchema } from '@/lib/navigation-schema';

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const data = navItemSchema.parse(await request.json());

    const [row] = await db
      .insert(navigation)
      .values({
        label: data.label,
        url: data.url,
        location: data.location,
        parentId: data.parentId ?? null,
        order: data.order,
        isActive: data.isActive,
        openInNew: data.openInNew,
      })
      .returning();

    if (!row) throw new Error('insert returned no row');

    const translations = (data.translations ?? []).filter((t) => t.label.trim().length > 0);
    if (translations.length > 0) {
      await db.insert(navigationI18n).values(
        translations.map((t) => ({ navigationId: row.id, locale: t.locale, label: t.label }))
      );
    }

    // The public navbar and footer are rendered in a cached layout.
    revalidatePath('/', 'layout');

    return NextResponse.json({ success: true, data: { id: row.id } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: 'Validation failed', issues: error.issues } },
        { status: 400 }
      );
    }
    console.error('Navigation create error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Internal server error' } },
      { status: 500 }
    );
  }
}

/** Persists a new order for one menu location after a drag. */
export async function PATCH(request: Request) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const { ids } = reorderSchema.parse(await request.json());

    // Index in the submitted array IS the order — the client sends the whole
    // list, so there is no chance of two items claiming the same position.
    for (const [index, id] of ids.entries()) {
      await db.update(navigation).set({ order: index }).where(eq(navigation.id, id));
    }

    revalidatePath('/', 'layout');
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: { message: 'Validation failed' } }, { status: 400 });
    }
    console.error('Navigation reorder error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Internal server error' } },
      { status: 500 }
    );
  }
}
