// app/api/media/cleanup/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { mediaAssets } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { deleteStored } from '@/lib/media/storage';
import { countUnusedAssets, filterStillUnused, getAssetsByIds } from '@/lib/media/usage';

export const runtime = 'nodejs';

const schema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

/** How many uploads nothing currently references. */
export async function GET(request: Request) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  return NextResponse.json({ success: true, data: { unused: await countUnusedAssets() } });
}

/**
 * Deletes uploads that nothing references.
 *
 * admin-only, and it re-checks. The list the browser is looking at is a
 * snapshot: between rendering it and this call, an editor in another tab can
 * drop one of those images into a page. Trusting the submitted ids would delete
 * a live image; narrowing them to what is *still* unused cannot.
 */
export async function POST(request: Request) {
  const auth = await requireApiAuth(request, ['admin']);
  if (!auth.ok) return auth.response;

  try {
    const { ids } = schema.parse(await request.json());

    const stillUnused = await filterStillUnused(ids);
    const skipped = ids.length - stillUnused.length;

    if (stillUnused.length === 0) {
      return NextResponse.json({ success: true, data: { deleted: 0, skipped } });
    }

    const assets = await getAssetsByIds(stillUnused);

    // Files first: an orphaned row pointing at nothing is a worse outcome than
    // orphaned bytes, and it is the state the whole feature exists to clean up.
    for (const asset of assets) {
      await deleteStored(asset.url);
      await deleteStored(asset.thumbnailUrl);
    }

    await db.delete(mediaAssets).where(inArray(mediaAssets.id, stillUnused));

    return NextResponse.json({
      success: true,
      data: { deleted: stillUnused.length, skipped },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: { message: 'قيمة غير صالحة' } }, { status: 400 });
    }
    console.error('Media cleanup error:', error);
    return NextResponse.json({ success: false, error: { message: 'تعذّر الحذف' } }, { status: 500 });
  }
}
