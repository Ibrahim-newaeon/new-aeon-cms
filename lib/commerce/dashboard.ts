// lib/commerce/dashboard.ts
import { db } from '@/lib/db';
import { orders, productVariants, products } from '@/lib/db/schema';
import { and, asc, eq, gte, lt, sql } from 'drizzle-orm';
import { trendOf, trendWindows, type Trend } from '@/lib/admin/trend';
import { NON_REVENUE_STATUSES } from './customers';

/**
 * The commerce tiles on the admin dashboard.
 *
 * The dashboard showed content and media counts only, even with the shop
 * switched on — so a store owner opening the panel learned how many draft pages
 * they had and nothing about whether anything had sold.
 */

export interface LowStockRow {
  sku: string;
  productSlug: string;
  productName: string;
  stock: number;
  threshold: number;
}

export interface CommerceStats {
  orders: { current: number; trend: Trend };
  revenue: { current: number; trend: Trend };
  /** Orders sitting in `pending` — someone has to act on these. */
  pending: number;
  lowStock: LowStockRow[];
  lowStockCount: number;
}

/** Cancelled and refunded orders are not revenue; counting them inflates every tile. */
const revenueOf = (from: Date, to?: Date) =>
  db
    .select({ n: sql<number>`coalesce(sum(${orders.total}), 0)::int` })
    .from(orders)
    .where(
      and(
        gte(orders.createdAt, from),
        to ? lt(orders.createdAt, to) : undefined,
        sql`${orders.status} not in ('cancelled','refunded')`
      )
    );

const ordersIn = (from: Date, to?: Date) =>
  db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(gte(orders.createdAt, from), to ? lt(orders.createdAt, to) : undefined));

export async function getCommerceStats(locale: 'ar' | 'en' = 'ar'): Promise<CommerceStats> {
  const { currentStart, previousStart } = trendWindows();

  const [
    ordersNow, ordersBefore, revenueNow, revenueBefore, pendingRow, lowStock,
  ] = await Promise.all([
    ordersIn(currentStart),
    ordersIn(previousStart, currentStart),
    revenueOf(currentStart),
    revenueOf(previousStart, currentStart),

    db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(eq(orders.status, 'pending')),

    /**
     * Variants at or below their own threshold.
     *
     * `lowStockThreshold` has been a column on every variant since C1 and was
     * never read anywhere in the panel — the number a shop had already set for
     * each SKU, doing nothing. Compared per row rather than against one global
     * number, because that is what the column means.
     */
    db
      .select({
        sku: productVariants.sku,
        productSlug: products.slug,
        productName: sql<string>`coalesce(
          (select i.name from product_i18n i
            where i.product_id = products.id and i.locale::text = ${locale}),
          (select i.name from product_i18n i
            where i.product_id = products.id order by i.locale limit 1),
          products.slug
        )`,
        stock: sql<number>`coalesce(${productVariants.stock}, 0)::int`,
        threshold: sql<number>`coalesce(${productVariants.lowStockThreshold}, 0)::int`,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(
        and(
          eq(productVariants.isActive, true),
          eq(products.isActive, true),
          sql`coalesce(${productVariants.stock}, 0) <= coalesce(${productVariants.lowStockThreshold}, 0)`
        )
      )
      .orderBy(asc(productVariants.stock), asc(productVariants.sku)),
  ]);

  const currentOrders = ordersNow[0]?.n ?? 0;
  const currentRevenue = revenueNow[0]?.n ?? 0;

  return {
    orders: { current: currentOrders, trend: trendOf(currentOrders, ordersBefore[0]?.n ?? 0) },
    revenue: { current: currentRevenue, trend: trendOf(currentRevenue, revenueBefore[0]?.n ?? 0) },
    pending: pendingRow[0]?.n ?? 0,
    // Capped for the tile; the count is the honest total behind it.
    lowStock: lowStock.slice(0, 8),
    lowStockCount: lowStock.length,
  };
}

export { NON_REVENUE_STATUSES };
