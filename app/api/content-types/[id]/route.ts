// app/api/content-types/[id]/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { contentTypes } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { checkPrefix, canDelete } from '@/lib/content/types-admin';

export const runtime = 'nodejs';

const WRITERS = ['admin'] as const;

const patchSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional(),
  routePrefix: z.string().trim().max(64).nullable().optional(),
  hasArchive: z.boolean(),
  hasCategories: z.boolean(),
  hasTags: z.boolean(),
  hasFeaturedImage: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(9999),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, WRITERS);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  try {
    const data = patchSchema.parse(await request.json());

    // Excludes itself, so re-saving a type without changing its prefix does
    // not report the prefix as taken by itself.
    const prefix = await checkPrefix(data.routePrefix, id);
    if (!prefix.ok) {
      return NextResponse.json({ success: false, error: { message: prefix.message } }, { status: 400 });
    }

    await db
      .update(contentTypes)
      .set({ ...data, routePrefix: prefix.value })
      .where(eq(contentTypes.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: error.issues[0]?.message ?? 'Invalid input' } },
        { status: 400 }
      );
    }
    console.error('Update content type failed:', error);
    return NextResponse.json({ success: false, error: { message: 'Server error' } }, { status: 500 });
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, WRITERS);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  // Refuses rather than cascading. "Delete the type" is not a request to
  // delete what people wrote under it.
  const allowed = await canDelete(id);
  if (!allowed.ok) {
    return NextResponse.json(
      { success: false, error: { message: allowed.reason ?? 'Cannot delete' } },
      { status: 409 }
    );
  }

  await db.delete(contentTypes).where(eq(contentTypes.id, id));
  return NextResponse.json({ success: true });
}
