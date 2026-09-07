// lib/themes/content-kind.ts
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { contentTypes } from '@/lib/db/schema';

export async function contentKindForTypeId(
  typeId: string | null | undefined
): Promise<'page' | 'post'> {
  if (!typeId) return 'page';
  const [row] = await db
    .select({ slug: contentTypes.slug })
    .from(contentTypes)
    .where(eq(contentTypes.id, typeId))
    .limit(1);
  return row?.slug === 'post' ? 'post' : 'page';
}
