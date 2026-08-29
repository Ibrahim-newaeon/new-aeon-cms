// app/api/forms/export/route.ts
import { db } from '@/lib/db';
import { formSubmissions } from '@/lib/db/schema';
import { asc, eq } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { submissionsToCsv, newsletterToCsv, csvFilename } from '@/lib/forms/csv';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * CSV export, served as a normal response with Content-Disposition.
 *
 * Deliberately a route rather than a client-side Blob download: script-driven
 * saves and `<a download>` are blocked in some embedding contexts, whereas a
 * plain attachment response works everywhere. It also keeps the whole dataset
 * on the server instead of shipping it to the browser to be re-serialised.
 */
export async function GET(request: Request) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  const type = new URL(request.url).searchParams.get('type') === 'newsletter'
    ? 'newsletter'
    : 'contact';

  try {
    const rows = await db
      .select({
        payload: formSubmissions.payload,
        pageSlug: formSubmissions.pageSlug,
        locale: formSubmissions.locale,
        createdAt: formSubmissions.createdAt,
      })
      .from(formSubmissions)
      .where(eq(formSubmissions.type, type))
      .orderBy(asc(formSubmissions.createdAt));

    const csv = type === 'newsletter' ? newsletterToCsv(rows) : submissionsToCsv(rows);

    return new Response(csv, {
      headers: {
        // charset=utf-8 alongside the BOM the builder writes: between them,
        // Excel and every other reader agree on the encoding.
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${csvFilename(type, new Date())}"`,
        // An export is a point-in-time snapshot; a cached one is a wrong one.
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Form export error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'تعذّر التصدير' } },
      { status: 500 }
    );
  }
}
