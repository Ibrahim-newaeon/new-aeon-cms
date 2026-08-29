// app/(admin)/admin/commerce/reviews/page.tsx
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { productI18n, products } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { verifyAccessToken } from '@/lib/auth/session';
import { createTranslator } from '@/lib/admin-i18n';
import { getAdminLocale } from '@/lib/admin-i18n/server';
import { listReviewsForAdmin } from '@/lib/commerce/reviews';
import { ReviewsManager, type ReviewRow } from '@/components/admin/reviews-manager';

export const dynamic = 'force-dynamic';

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const locale = await getAdminLocale();
  const t = createTranslator(locale);
  const params = await searchParams;

  const status =
    params.status === 'approved' || params.status === 'rejected' || params.status === 'pending'
      ? params.status
      : undefined;

  let canDelete = false;
  try {
    const token = (await cookies()).get('access_token')?.value;
    if (token) canDelete = (await verifyAccessToken(token)).role === 'admin';
  } catch {
    canDelete = false;
  }

  const reviews = await listReviewsForAdmin(status);

  // One grouped lookup for the product names rather than one per review.
  const productIds = [...new Set(reviews.map((r) => r.productId))];
  const names = productIds.length
    ? await db
        .select({ id: products.id, slug: products.slug, name: productI18n.name })
        .from(products)
        .leftJoin(
          productI18n,
          and(eq(productI18n.productId, products.id), eq(productI18n.locale, locale))
        )
        .where(inArray(products.id, productIds))
    : [];

  const nameById = new Map(names.map((n) => [n.id, n.name ?? n.slug]));

  // Dates cross to a Client Component, so they travel as ISO strings.
  const rows: ReviewRow[] = reviews.map((r) => ({
    id: r.id,
    productName: nameById.get(r.productId) ?? '—',
    customerName: r.customerName,
    phone: r.phone,
    rating: r.rating,
    body: r.body,
    status: r.status,
    moderatedBy: r.moderatedBy,
    createdAt: r.createdAt?.toISOString() ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--admin-text)]">{t('reviews.title')}</h1>
        <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{t('reviews.subtitle')}</p>
      </div>

      <ReviewsManager rows={rows} status={status ?? ''} canDelete={canDelete} />
    </div>
  );
}
