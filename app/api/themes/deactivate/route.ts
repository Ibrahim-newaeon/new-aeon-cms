// app/api/themes/deactivate/route.ts
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { auditLog } from '@/lib/db/schema';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { deactivateThemes } from '@/lib/themes/active';

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, ['admin']);
  if (!auth.ok) return auth.response;

  await deactivateThemes();
  await db.insert(auditLog).values({
    userId: auth.user.sub,
    action: 'themes.deactivate',
    entityType: 'theme',
    entityId: 'all',
  });
  revalidatePath('/', 'layout');
  return NextResponse.json({ success: true });
}
