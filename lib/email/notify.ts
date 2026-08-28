// lib/email/notify.ts
import 'server-only';
import { db } from '@/lib/db';
import { orders, orderItems, settings as settingsTable } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { sendMail, storeRecipient } from './send';
import { orderConfirmation, orderAlert, type OrderMailData } from './templates/order';
import { formAlert } from './templates/form';
import type { MailLocale } from './render';

/**
 * High-level "something happened, tell someone" helpers.
 *
 * These read the order back from the database rather than taking the values the
 * caller happened to have in hand. The email is a receipt, and a receipt that
 * disagrees with the stored order is worse than no receipt — it also means a
 * later resend produces exactly the same message.
 *
 * Nothing here throws. Callers invoke these after their own work is committed.
 */

async function storeName(): Promise<string> {
  try {
    const rows = await db.select({ name: settingsTable.siteName }).from(settingsTable).limit(1);
    return rows[0]?.name || 'New Aeon';
  } catch {
    return 'New Aeon';
  }
}

async function loadOrderMail(orderId: string, locale: MailLocale): Promise<OrderMailData | null> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return null;

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));

  return {
    orderNumber: order.orderNumber,
    locale,
    currency: order.currency || 'JOD',
    storeName: await storeName(),
    customerName: order.customerName,
    phone: order.phone,
    email: order.email,
    governorate: order.governorate,
    city: order.city,
    addressLine: order.addressLine,
    landmark: order.landmark,
    notes: order.notes,
    couponCode: order.couponCode,
    // Snapshots, so the email matches what was bought even after a later
    // catalogue edit.
    items: items.map((i) => ({
      name: i.nameSnapshot,
      sku: i.skuSnapshot,
      qty: i.qty,
      unitPrice: i.priceSnapshot,
    })),
    subtotal: order.subtotal,
    discount: order.discount ?? 0,
    shipping: order.shipping,
    total: order.total,
  };
}

export interface OrderNotifyResult {
  customer: 'sent' | 'skipped' | 'failed';
  store: 'sent' | 'skipped' | 'failed';
}

/**
 * Order confirmation to the customer, alert to the store.
 *
 * MUST be called after `placeOrder` has committed and OUTSIDE its transaction —
 * an SMTP round-trip inside that transaction would hold row locks on
 * product_variants for the length of a network call.
 */
export async function notifyOrderPlaced(
  orderId: string,
  locale: MailLocale
): Promise<OrderNotifyResult> {
  const result: OrderNotifyResult = { customer: 'skipped', store: 'skipped' };

  try {
    const data = await loadOrderMail(orderId, locale);
    if (!data) {
      console.error(`[mail] order ${orderId} not found; no notification sent`);
      return { customer: 'failed', store: 'failed' };
    }

    // The customer copy is conditional: this is a phone-first COD store and an
    // email address is optional at checkout.
    if (data.email) {
      const sent = await sendMail({ to: data.email, ...orderConfirmation(data) });
      result.customer = sent.ok ? 'sent' : 'failed';
    }

    const to = await storeRecipient();
    if (to) {
      const sent = await sendMail({ to, ...orderAlert(data) });
      result.store = sent.ok ? 'sent' : 'failed';
    } else {
      console.warn('[mail] no store recipient configured — order alert not sent');
    }
  } catch (error) {
    // Belt and braces: sendMail already swallows delivery errors, so reaching
    // here means the database read or template render failed. The order is
    // already committed and must still return success to the customer.
    console.error('[mail] order notification failed:', error);
    return { customer: 'failed', store: 'failed' };
  }

  return result;
}

/** Contact / newsletter submission alert to the store. */
export async function notifyFormSubmission(input: {
  type: 'contact' | 'newsletter';
  locale: MailLocale;
  fields: Record<string, string>;
  pageSlug?: string | null;
}): Promise<'sent' | 'skipped' | 'failed'> {
  try {
    const to = await storeRecipient();
    if (!to) {
      console.warn('[mail] no store recipient configured — form alert not sent');
      return 'skipped';
    }

    const sent = await sendMail({
      to,
      ...formAlert({
        type: input.type,
        locale: input.locale,
        fields: input.fields,
        pageSlug: input.pageSlug,
        submittedAt: new Date(),
      }),
    });

    return sent.ok ? 'sent' : 'failed';
  } catch (error) {
    console.error('[mail] form notification failed:', error);
    return 'failed';
  }
}
