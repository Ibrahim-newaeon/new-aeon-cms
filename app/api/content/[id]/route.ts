// app/api/content/[id]/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { content, contentI18n } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth/api-guard';
import {
  canEdit, checkStatusChange, PERMISSION_MESSAGE,
} from '@/lib/content/permissions';
import { contentPayloadSchema, asContentBlocks } from '@/lib/blocks/content-schema';
import { setContentTaxonomy } from '@/lib/content/taxonomy';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin', 'editor', 'author']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const validated = contentPayloadSchema.parse(await request.json());

    const existing = await db.select().from(content).where(eq(content.id, id)).limit(1);
    const current = existing[0];
    if (!current) {
      return NextResponse.json(
        { success: false, error: { message: 'Content not found' } },
        { status: 404 }
      );
    }

    /**
     * An author may work on their own drafts and nothing else. Without this an
     * author could edit — and unpublish — an editor's live pages, which the
     * role split exists precisely to prevent.
     */
    if (!canEdit(auth.user.role, current.authorId, auth.user.sub)) {
      return NextResponse.json(
        { success: false, error: { message: PERMISSION_MESSAGE['not-yours'] } },
        { status: 403 }
      );
    }

    const allowed = checkStatusChange(
      auth.user.role,
      validated.status,
      (current.status ?? 'draft') as 'draft' | 'published' | 'archived'
    );
    if (!allowed.ok) {
      return NextResponse.json(
        { success: false, error: { message: PERMISSION_MESSAGE[allowed.reason] } },
        { status: 403 }
      );
    }

    await db
      .update(content)
      .set({
        slug: validated.slug,
        status: validated.status,
        featuredImage: validated.featuredImage ?? null,
        updatedAt: new Date(),
        // Stamp publishedAt on the draft -> published transition only, so
        // re-saving a live page does not reset its publication date.
        publishedAt:
          validated.status === 'published' && !current.publishedAt
            ? new Date()
            : current.publishedAt,
      })
      .where(eq(content.id, id));

    // Upsert per locale. Each locale owns an independent block tree, so a
    // locale absent from the payload is left untouched rather than deleted.
    for (const t of validated.translations) {
      const values = {
        title: t.title,
        excerpt: t.excerpt ?? null,
        body: asContentBlocks(t.body ?? []),
        metaTitle: t.metaTitle ?? null,
        metaDescription: t.metaDescription ?? null,
        ogImage: t.ogImage ?? null,
        noIndex: t.noIndex ?? false,
      };

      const found = await db
        .select({ id: contentI18n.id })
        .from(contentI18n)
        .where(and(eq(contentI18n.contentId, id), eq(contentI18n.locale, t.locale)))
        .limit(1);

      if (found[0]) {
        await db.update(contentI18n).set(values).where(eq(contentI18n.id, found[0].id));
      } else {
        await db.insert(contentI18n).values({ contentId: id, locale: t.locale, ...values });
      }
    }

    await setContentTaxonomy(id, validated.categoryIds, validated.tagIds);

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: 'Validation failed', issues: error.issues } },
        { status: 400 }
      );
    }
    console.error('Content update error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Internal server error' } },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // middleware skips /api/*, so this route is public unless we guard it here.
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;

    // contentI18n.contentId is ON DELETE CASCADE; explicit for clarity.
    await db.delete(contentI18n).where(eq(contentI18n.contentId, id));
    await db.delete(content).where(eq(content.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Failed to delete content' } },
      { status: 500 }
    );
  }
}

// POST is intentionally NOT exported. A previous version aliased it to DELETE
// so a bare <form method="POST"> could call it — unauthenticated, no origin
// check, which let any third-party page wipe the content table.
