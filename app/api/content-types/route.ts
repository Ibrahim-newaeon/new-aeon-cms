// app/api/content-types/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { contentTypes } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { checkPrefix } from '@/lib/content/types-admin';
import { slugSchema } from '@/lib/taxonomy-schema';

export const runtime = 'nodejs';

/** Structural, so admin-only — an editor should not be able to invent a route. */
const WRITERS = ['admin'] as const;

const typeSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional(),
  routePrefix: z.string().trim().max(64).nullable().optional(),
  hasArchive: z.boolean().default(true),
  hasCategories: z.boolean().default(true),
  hasTags: z.boolean().default(true),
  hasFeaturedImage: z.boolean().default(true),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, WRITERS);
  if (!auth.ok) return auth.response;

  try {
    const data = typeSchema.parse(await request.json());

    const [existing] = await db
      .select({ id: contentTypes.id })
      .from(contentTypes)
      .where(eq(contentTypes.slug, data.slug))
      .limit(1);
    if (existing) {
      return NextResponse.json(
        { success: false, error: { message: 'A content type with that key already exists.' } },
        { status: 409 }
      );
    }

    // Checked here rather than in the schema: whether a prefix is free depends
    // on the other rows, which zod cannot see.
    const prefix = await checkPrefix(data.routePrefix);
    if (!prefix.ok) {
      return NextResponse.json({ success: false, error: { message: prefix.message } }, { status: 400 });
    }

    const [row] = await db
      .insert(contentTypes)
      .values({ ...data, routePrefix: prefix.value, isBuiltIn: false })
      .returning({ id: contentTypes.id });

    return NextResponse.json({ success: true, data: { id: row!.id } }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: error.issues[0]?.message ?? 'Invalid input' } },
        { status: 400 }
      );
    }
    console.error('Create content type failed:', error);
    return NextResponse.json({ success: false, error: { message: 'Server error' } }, { status: 500 });
  }
}
