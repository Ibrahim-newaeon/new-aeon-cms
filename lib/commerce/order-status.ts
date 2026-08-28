// lib/commerce/order-status.ts

/**
 * The order state machine.
 *
 * Deliberately not `server-only`: the admin UI imports it to decide which
 * transitions to offer, and the API route imports it to enforce them. Both
 * must read the same table or they drift, and the UI half is worthless as a
 * guarantee anyway — the route is where this is actually enforced.
 */

export const ORDER_STATUSES = [
  'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ['pending', 'authorized', 'paid', 'failed', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Legal moves. An order walks forward through fulfilment, can be cancelled at
 * any point before delivery, and once delivered can only be refunded.
 *
 * `cancelled` and `refunded` are terminal. That is what makes the stock
 * restore below safe to run exactly once.
 */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};

export function nextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from] ?? [];
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Statuses that mean the goods are coming back into stock.
 *
 * Both are terminal and reachable only once, so a transition INTO one of them
 * is the single moment the units must be returned to `product_variants.stock`.
 */
export function restoresStock(to: OrderStatus): boolean {
  return to === 'cancelled' || to === 'refunded';
}

/**
 * Transitions the customer is told about.
 *
 * `processing` is deliberately absent: it means the shop picked the box off a
 * shelf, which is not news to the person waiting for it, and an email per
 * internal step trains customers to ignore the ones that matter.
 */
export function notifiesCustomer(to: OrderStatus): boolean {
  return to === 'confirmed' || to === 'shipped' || to === 'delivered' || to === 'cancelled';
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

/** Bilingual labels, shared by the admin UI and the status-change email. */
export const STATUS_LABEL: Record<OrderStatus, { ar: string; en: string }> = {
  pending: { ar: 'قيد الانتظار', en: 'Pending' },
  confirmed: { ar: 'مؤكّد', en: 'Confirmed' },
  processing: { ar: 'قيد التجهيز', en: 'Processing' },
  shipped: { ar: 'تم الشحن', en: 'Shipped' },
  delivered: { ar: 'تم التوصيل', en: 'Delivered' },
  cancelled: { ar: 'ملغى', en: 'Cancelled' },
  refunded: { ar: 'مسترجع', en: 'Refunded' },
};

export const PAYMENT_LABEL: Record<PaymentStatus, { ar: string; en: string }> = {
  pending: { ar: 'غير مدفوع', en: 'Unpaid' },
  authorized: { ar: 'محجوز', en: 'Authorized' },
  paid: { ar: 'مدفوع', en: 'Paid' },
  failed: { ar: 'فشل', en: 'Failed' },
  refunded: { ar: 'مسترجع', en: 'Refunded' },
};

/**
 * Badge classes per status, so the list and the detail page cannot disagree.
 * Tinted-transparent on a dark surface, matching the existing admin tables —
 * the admin theme is dark (`--admin-bg: #0f1115`), so solid light fills would
 * glare.
 */
export const STATUS_TONE: Record<OrderStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-300',
  confirmed: 'bg-sky-500/15 text-sky-300',
  processing: 'bg-indigo-500/15 text-indigo-300',
  shipped: 'bg-violet-500/15 text-violet-300',
  delivered: 'bg-green-500/20 text-green-400',
  cancelled: 'bg-rose-500/15 text-rose-300',
  refunded: 'bg-gray-500/20 text-gray-400',
};

export const PAYMENT_TONE: Record<PaymentStatus, string> = {
  pending: 'bg-gray-500/20 text-gray-400',
  authorized: 'bg-sky-500/15 text-sky-300',
  paid: 'bg-green-500/20 text-green-400',
  failed: 'bg-rose-500/15 text-rose-300',
  refunded: 'bg-gray-500/20 text-gray-400',
};
