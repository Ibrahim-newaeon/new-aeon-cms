// lib/email/templates/order-status.ts
import 'server-only';
import { formatPrice } from '@/lib/money';
import { layout, esc, row, table, textBlock, type MailLocale } from '../render';
import type { Message } from '../transport';
import { STATUS_LABEL, type OrderStatus } from '@/lib/commerce/order-status';

export interface OrderStatusMailData {
  orderNumber: string;
  locale: MailLocale;
  currency: string;
  storeName: string;
  customerName: string;
  status: OrderStatus;
  total: number;
  note?: string | null;
}

/**
 * Per-status headline. Only the four statuses `notifiesCustomer` allows appear
 * here; the others never reach this template.
 */
const HEADLINE: Partial<Record<OrderStatus, { ar: string; en: string }>> = {
  confirmed: {
    ar: 'تم تأكيد طلبك',
    en: 'Your order is confirmed',
  },
  shipped: {
    ar: 'طلبك في الطريق إليك',
    en: 'Your order is on its way',
  },
  delivered: {
    ar: 'تم توصيل طلبك',
    en: 'Your order has been delivered',
  },
  cancelled: {
    ar: 'تم إلغاء طلبك',
    en: 'Your order has been cancelled',
  },
};

const BODY_LINE: Partial<Record<OrderStatus, { ar: string; en: string }>> = {
  confirmed: {
    ar: 'استلمنا طلبك وأكّدناه، وسنبدأ بتجهيزه قريباً.',
    en: 'We have confirmed your order and will start preparing it shortly.',
  },
  shipped: {
    ar: 'خرج طلبك للتوصيل. سيتواصل معك المندوب قبل الوصول.',
    en: 'Your order has left for delivery. The courier will call you before arriving.',
  },
  delivered: {
    ar: 'نتمنى أن ينال إعجابك. شكراً لثقتك بنا.',
    en: 'We hope you enjoy it. Thank you for shopping with us.',
  },
  cancelled: {
    ar: 'تم إلغاء الطلب. إذا لم يكن هذا ما طلبته، يرجى التواصل معنا.',
    en: 'This order has been cancelled. If that was not what you expected, please contact us.',
  },
};

const T = {
  ar: {
    subject: (n: string, s: string) => `${s} — تحديث على الطلب ${n}`,
    orderNumber: 'رقم الطلب',
    status: 'الحالة',
    total: 'الإجمالي',
    note: 'ملاحظة من المتجر',
    viewOrder: 'عرض تفاصيل الطلب',
    footer: (s: string) => `${s} — يصلك هذا البريد لأنك أتممت طلباً على متجرنا.`,
  },
  en: {
    subject: (n: string, s: string) => `${s} — update on order ${n}`,
    orderNumber: 'Order number',
    status: 'Status',
    total: 'Total',
    note: 'Note from the store',
    viewOrder: 'View order details',
    footer: (s: string) => `${s} — you are receiving this because you placed an order with us.`,
  },
} as const;

export function orderStatusChanged(data: OrderStatusMailData): Omit<Message, 'to'> {
  const t = T[data.locale];
  const headline = HEADLINE[data.status]?.[data.locale] ?? STATUS_LABEL[data.status][data.locale];
  const line = BODY_LINE[data.status]?.[data.locale] ?? '';

  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const url = `${base}/${data.locale}/order/${encodeURIComponent(data.orderNumber)}`;

  const body = [
    table(
      [
        row(t.orderNumber, `<strong dir="ltr">${esc(data.orderNumber)}</strong>`),
        row(t.status, `<strong>${esc(STATUS_LABEL[data.status][data.locale])}</strong>`),
        row(t.total, esc(formatPrice(data.total, data.currency, data.locale)), { ltr: true }),
        // The note is written by an admin, but it still travels through esc —
        // a compromised or careless admin account should not be able to inject
        // markup into a customer's mail client.
        data.note ? row(t.note, esc(data.note).replace(/\n/g, '<br>')) : '',
      ].join('')
    ),
    `<div style="margin-top:22px;">
       <a href="${esc(url)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;
          padding:11px 20px;border-radius:8px;font-size:13px;font-weight:600;">${esc(t.viewOrder)}</a>
     </div>`,
  ].join('');

  return {
    subject: t.subject(data.orderNumber, data.storeName),
    html: layout({
      locale: data.locale,
      title: headline,
      intro: line || undefined,
      body,
      footer: t.footer(data.storeName),
    }),
    text: textBlock([
      headline,
      line,
      '',
      `${t.orderNumber}: ${data.orderNumber}`,
      `${t.status}: ${STATUS_LABEL[data.status][data.locale]}`,
      `${t.total}: ${formatPrice(data.total, data.currency, data.locale)}`,
      data.note ? `${t.note}: ${data.note}` : null,
      '',
      `${t.viewOrder}: ${url}`,
    ]),
  };
}
