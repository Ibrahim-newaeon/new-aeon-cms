// app/api/content/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { content, contentI18n, contentTypes } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth/api-guard';
import {
  checkStatusChange, resolveAuthorId, PERMISSION_MESSAGE,
} from '@/lib/content/permissions';
import type { ContentBlock } from '@/lib/blocks/types';
import { setContentTaxonomy } from '@/lib/content/taxonomy';
import { CONTENT_TYPE_SLUGS } from '@/lib/content/content-types';
import { listContentByType } from '@/lib/content/list';

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

/**
 * Lists one content type, so a caller can tell an update from a create.
 *
 * `content.slug` carries an index, not a unique constraint, so POSTing a slug
 * that already exists does not fail — it silently produces a SECOND page at
 * the same address, and which one the site serves is then down to row order.
 * Anything publishing more than one page at a time has to look first, and
 * until now there was no way to: the admin screens read the database directly
 * through listContentByType() and no route exposed it.
 *
 * Same visibility as those screens, deliberately: an author sees the list and
 * is still refused the edit by canEdit() in PUT. Narrowing it here would mean
 * two different answers to "what exists" depending on the door used.
 */
export async function GET(request: Request) {
  const auth = await requireApiAuth(request, ['admin', 'editor', 'author']);
  if (!auth.ok) return auth.response;

  const type = new URL(request.url).searchParams.get('type') ?? 'page';
  const parsed = z.enum(CONTENT_TYPE_SLUGS).safeParse(type);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { message: `Unknown content type "${type}"` } },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true, data: await listContentByType(parsed.data) });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, ['admin', 'editor', 'author']);
  if (!auth.ok) return auth.response;

  try {
    const validated = createContentSchema.parse(await request.json());

    // An author writes drafts; an editor decides what goes live. Refused
    // rather than downgraded, so nobody is told their page published when it
    // did not.
    const allowed = checkStatusChange(auth.user.role, validated.status, null);
    if (!allowed.ok) {
      return NextResponse.json(
        { success: false, error: { message: PERMISSION_MESSAGE[allowed.reason] } },
        { status: 403 }
      );
    }

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
        // Never the client's suggestion for an author: authorId was an
        // optional body field, so anyone could credit a colleague.
        authorId: resolveAuthorId(auth.user.role, validated.authorId, auth.user.sub),
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
