// lib/commerce/stock-alerts.ts
import 'server-only';
import { db } from '@/lib/db';
import { stockAlerts, productVariants, products, productI18n } from '@/lib/db/schema';
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { sendMail } from '@/lib/email/send';
import { backInStock } from '@/lib/email/templates/back-in-stock';
import { getSettings } from '@/lib/db/queries';

/**
 * Back-in-stock notifications.
 *
 * A shopper leaves an address against a variant that has run out and hears
 * once when it returns. `notified_at` is set rather than the row deleted: the
 * record of having told them is exactly what stops them being told again on
 * every subsequent restock.
 */

export type SubscribeResult = 'subscribed' | 'already' | 'in-stock' | 'not-found';

export async function subscribeToStock(
  variantId: string,
  email: string,
  locale: 'ar' | 'en'
): Promise<SubscribeResult> {
  const [variant] = await db
    .select({ id: productVariants.id, stock: productVariants.stock })
    .from(productVariants)
    .where(eq(productVariants.id, variantId))
    .limit(1);

  if (!variant) return 'not-found';
  // Nothing to wait for. Telling the shopper it is available now is more use
  // than silently queueing a notification that would fire immediately.
  if ((variant.stock ?? 0) > 0) return 'in-stock';

  const address = email.trim().toLowerCase();

  try {
    await db.insert(stockAlerts).values({ variantId, email: address, locale });
    return 'subscribed';
  } catch (error) {
    const code =
      (error as { code?: string }).code ??
      (error as { cause?: { code?: string } }).cause?.code;

    // 23505 = the (variant, email) unique index. Asking twice is not an error
    // worth showing; the shopper's intent is already recorded.
    if (code === '23505') {
      // ...unless the previous request was already fulfilled, in which case
      // this is a fresh intent for a later restock and the clock resets.
      await db
        .update(stockAlerts)
        .set({ notifiedAt: null, locale })
        .where(and(eq(stockAlerts.variantId, variantId), eq(stockAlerts.email, address)));

      return 'already';
    }

    throw error;
  }
}

/**
 * Notifies everyone waiting on variants that now have stock.
 *
 * Called from the places stock can RISE — an order being cancelled or refunded,
 * and an admin editing a variant. Never able to throw into its caller: a mail
 * failure must not roll back a cancellation or a product save.
 */
export async function notifyRestocked(variantIds: string[]): Promise<number> {
  if (variantIds.length === 0) return 0;

  try {
    const waiting = await db
      .select({
        id: stockAlerts.id,
        email: stockAlerts.email,
        locale: stockAlerts.locale,
        variantId: stockAlerts.variantId,
        sku: productVariants.sku,
        productSlug: products.slug,
      })
      .from(stockAlerts)
      .innerJoin(productVariants, eq(productVariants.id, stockAlerts.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(
        and(
          inArray(stockAlerts.variantId, variantIds),
          isNull(stockAlerts.notifiedAt),
          // Re-checked here rather than trusted from the caller: the caller
          // knows it changed something, not that the result is purchasable.
          gt(productVariants.stock, 0)
        )
      );

    if (waiting.length === 0) return 0;

    const settings = await getSettings();
    const storeName = settings?.siteName || 'New Aeon';

    // Names are per-locale, so they are fetched once for the whole batch.
    const names = await db
      .select({
        productId: productI18n.productId,
        locale: productI18n.locale,
        name: productI18n.name,
      })
      .from(productI18n);

    const nameFor = (slug: string, productId: string, locale: 'ar' | 'en') =>
      names.find((n) => n.productId === productId && n.locale === locale)?.name ?? slug;

    const variantProduct = await db
      .select({ id: productVariants.id, productId: productVariants.productId })
      .from(productVariants)
      .where(inArray(productVariants.id, variantIds));

    let sent = 0;

    for (const alert of waiting) {
      const locale = (alert.locale ?? 'ar') as 'ar' | 'en';
      const productId =
        variantProduct.find((v) => v.id === alert.variantId)?.productId ?? '';

      const result = await sendMail({
        to: alert.email,
        ...backInStock({
          locale,
          storeName,
          productName: nameFor(alert.productSlug, productId, locale),
          sku: alert.sku,
          url: `${(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '')}/${locale}/products/${alert.productSlug}`,
        }),
      });

      // Marked regardless of delivery outcome. Retrying a bounced address on
      // every future restock is worse than one missed notification, and there
      // is no queue to retry from.
      await db
        .update(stockAlerts)
        .set({ notifiedAt: new Date() })
        .where(eq(stockAlerts.id, alert.id));

      if (result.ok) sent += 1;
    }

    return sent;
  } catch (error) {
    console.error('[stock-alerts] notification failed:', error);
    return 0;
  }
}

/** How many people are waiting on a variant, for the admin product form. */
export async function countWaiting(variantIds: string[]): Promise<Record<string, number>> {
  if (variantIds.length === 0) return {};

  const rows = await db
    .select({ variantId: stockAlerts.variantId, n: sql<number>`count(*)::int` })
    .from(stockAlerts)
    .where(and(inArray(stockAlerts.variantId, variantIds), isNull(stockAlerts.notifiedAt)))
    .groupBy(stockAlerts.variantId);

  return Object.fromEntries(rows.map((r) => [r.variantId, Number(r.n)]));
}
