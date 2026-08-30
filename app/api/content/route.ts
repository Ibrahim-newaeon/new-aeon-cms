// app/api/content/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { content, contentI18n, contentTypes } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth/api-guard';
import type { ContentBlock } from '@/lib/blocks/types';
import { setContentTaxonomy } from '@/lib/content/taxonomy';
import { CONTENT_TYPE_SLUGS } from '@/lib/content/content-types';

const createContentSchema = z.object({
  // Derived from CONTENT_TYPE_SLUGS: this was the fourth hand-written copy of
  // the same union, and it is the one that would have rejected a valid
  // resource at the API while every screen happily offered it.
  type: z.enum(CONTENT_TYPE_SLUGS),
  slug: z.string().trim().min(1).max(255),
  status: z.enum(['draft', 'published', 'archived']),
  authorId: z.string().uuid().optional(),
  featuredImage: z.string().max(2048).optional(),
  translations: z
    .array(
      z.object({
        locale: z.enum(['ar', 'en']),
        title: z.string().trim().min(1).max(255),
        excerpt: z.string().optional(),
        // Blocks are validated separately by the block registry; see
        // lib/blocks/. Kept permissive here so this route does not silently
        // reject valid block trees, but it is NOT `z.any()`.
        body: z.array(z.object({ type: z.string() }).passthrough()).optional(),
        metaTitle: z.string().max(255).optional(),
        metaDescription: z.string().optional(),
        ogImage: z.string().max(2048).optional(),
        noIndex: z.boolean().optional(),
      })
    )
    .min(1),
  categoryIds: z.array(z.string().uuid()).max(20).optional(),
  tagIds: z.array(z.string().uuid()).max(50).optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, ['admin', 'editor', 'author']);
  if (!auth.ok) return auth.response;

  try {
    const validated = createContentSchema.parse(await request.json());

    const contentType = await db
      .select()
      .from(contentTypes)
      .where(eq(contentTypes.slug, validated.type))
      .limit(1);

    const foundType = contentType[0];
    if (!foundType) {
      return NextResponse.json(
        { success: false, error: { message: `Content type "${validated.type}" not found` } },
        { status: 400 }
      );
    }

    const [newContent] = await db
      .insert(content)
      .values({
        typeId: foundType.id,
        slug: validated.slug,
        authorId: validated.authorId ?? auth.user.sub,
        featuredImage: validated.featuredImage,
        status: validated.status,
        publishedAt: validated.status === 'published' ? new Date() : null,
      })
      .returning();

    if (!newContent) {
      throw new Error('Insert returned no row');
    }

    await db.insert(contentI18n).values(
      validated.translations.map((t) => ({
        ...t,
        contentId: newContent.id,
        // Zod's passthrough() yields a structurally open object. Per-block
        // validation happens in the block registry; this narrows the column
        // type without weakening that check.
        body: (t.body ?? null) as ContentBlock[] | null,
      }))
    );

    await setContentTaxonomy(newContent.id, validated.categoryIds, validated.tagIds);

    return NextResponse.json({ success: true, data: { id: newContent.id } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: 'Validation failed', issues: error.issues } },
        { status: 400 }
      );
    }
    // Never return error.message here — it leaks Postgres constraint text.
    console.error('Content creation error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Internal server error' } },
      { status: 500 }
    );
  }
}
