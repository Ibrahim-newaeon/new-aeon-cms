// app/api/commerce/brands/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { brands } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { brandSchema } from '@/lib/commerce-schema';

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const data = brandSchema.parse(await request.json());

    const clash = await db.select({ id: brands.id }).from(brands).where(eq(brands.slug, data.slug)).limit(1);
    if (clash[0]) {
      return NextResponse.json(
        { success: false, error: { message: 'هذا الرابط مستخدم بالفعل' } },
        { status: 409 }
      );
    }

    const [row] = await db
      .insert(brands)
      .values({
        slug: data.slug,
        name: data.name,
        logoUrl: data.logoUrl || null,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
      })
      .returning();

    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: 'Validation failed', issues: error.issues } },
        { status: 400 }
      );
    }
    console.error('Brand create error:', error);
    return NextResponse.json({ success: false, error: { message: 'Internal server error' } }, { status: 500 });
  }
}
