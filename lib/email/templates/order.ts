// lib/email/templates/order.ts
import 'server-only';
import { formatPrice } from '@/lib/money';
import { layout, esc, row, table, divider, textBlock, type MailLocale } from '../render';
import type { Message } from '../transport';

export interface OrderMailItem {
  name: string;
  sku: string;
  qty: number;
  unitPrice: number;
}

export interface OrderMailData {
  orderNumber: string;
  locale: MailLocale;
  currency: string;
  storeName: string;
  customerName: string;
  phone: string;
  email?: string | null;
  governorate: string;
  city: string;
  addressLine: string;
  landmark?: string | null;
  notes?: string | null;
  couponCode?: string | null;
  items: OrderMailItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
}

const T = {
  ar: {
    confirmSubject: (n: string, s: string) => `${s} — تأكيد الطلب ${n}`,
    alertSubject: (n: string) => `طلب جديد ${n}`,
    confirmTitle: 'شكراً لطلبك',
    confirmIntro: (name: string) => `مرحباً ${name}، استلمنا طلبك وسنتواصل معك لتأكيد موعد التوصيل.`,
    alertTitle: 'طلب جديد',
    alertIntro: 'وصل طلب جديد إلى المتجر.',
    orderNumber: 'رقم الطلب',
    items: 'المنتجات',
    qty: 'الكمية',
    subtotal: 'المجموع الفرعي',
    discount: 'الخصم',
    coupon: 'كود الخصم',
    shipping: 'التوصيل',
    total: 'الإجمالي',
    payment: 'طريقة الدفع',
    cod: 'الدفع عند الاستلام',
    customer: 'العميل',
    phone: 'الهاتف',
    email: 'البريد الإلكتروني',
    address: 'العنوان',
    landmark: 'أقرب معلم',
    notes: 'ملاحظات',
    viewOrder: 'عرض تفاصيل الطلب',
    footer: (s: string) => `${s} — يصلك هذا البريد لأنك أتممت طلباً على متجرنا.`,
    alertFooter: 'إشعار تلقائي من نظام المتجر.',
  },
  en: {
    confirmSubject: (n: string, s: string) => `${s} — order ${n} confirmed`,
    alertSubject: (n: string) => `New order ${n}`,
    confirmTitle: 'Thank you for your order',
    confirmIntro: (name: string) => `Hi ${name}, we have received your order and will contact you to arrange delivery.`,
    alertTitle: 'New order',
    alertIntro: 'A new order has been placed.',
    orderNumber: 'Order number',
    items: 'Items',
    qty: 'Qty',
    subtotal: 'Subtotal',
    discount: 'Discount',
    coupon: 'Coupon',
    shipping: 'Delivery',
    total: 'Total',
    payment: 'Payment',
    cod: 'Cash on delivery',
    customer: 'Customer',
    phone: 'Phone',
    email: 'Email',
    address: 'Address',
    landmark: 'Landmark',
    notes: 'Notes',
    viewOrder: 'View order details',
    footer: (s: string) => `${s} — you are receiving this because you placed an order with us.`,
    alertFooter: 'Automated notification from the store.',
  },
} as const;

/**
 * Both locales share a shape but not their literal types, so helpers take the
 * union rather than whichever locale happened to be written first.
 */
type OrderStrings = (typeof T)[MailLocale];

function itemsTable(data: OrderMailData, t: OrderStrings): string {
  const rows = data.items
    .map(
      (item) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;">
          ${esc(item.name)}
          <span style="display:block;color:#94a3b8;font-size:11px;" dir="ltr">${esc(item.sku)}</span>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:center;" dir="ltr">${item.qty}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;white-space:nowrap;" dir="ltr">
          ${esc(formatPrice(item.unitPrice * item.qty, data.currency, data.locale))}
        </td>
      </tr>`
    )
    .join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
    <tr>
      <th align="${data.locale === 'ar' ? 'right' : 'left'}" style="padding:0 0 6px 0;font-size:11px;color:#94a3b8;font-weight:600;">${esc(t.items)}</th>
      <th style="padding:0 0 6px 0;font-size:11px;color:#94a3b8;font-weight:600;text-align:center;">${esc(t.qty)}</th>
      <th align="${data.locale === 'ar' ? 'right' : 'left'}" style="padding:0 0 6px 0;font-size:11px;color:#94a3b8;font-weight:600;"></th>
    </tr>
    ${rows}
  </table>`;
}

function totalsTable(data: OrderMailData, t: OrderStrings): string {
  const money = (n: number) => esc(formatPrice(n, data.currency, data.locale));

  return table(
    [
      row(t.subtotal, money(data.subtotal), { ltr: true }),
      data.discount > 0
        ? row(
            data.couponCode ? `${t.discount} (${data.couponCode})` : t.discount,
            `- ${money(data.discount)}`,
            { ltr: true }
          )
        : '',
      row(t.shipping, data.shipping === 0 ? money(0) : money(data.shipping), { ltr: true }),
      row(t.total, money(data.total), { ltr: true, strong: true }),
      row(t.payment, esc(t.cod)),
    ].join('')
  );
}

function addressTable(data: OrderMailData, t: OrderStrings): string {
  return table(
    [
      row(t.customer, esc(data.customerName)),
      row(t.phone, esc(data.phone), { ltr: true }),
      data.email ? row(t.email, esc(data.email), { ltr: true }) : '',
      row(t.address, esc([data.governorate, data.city, data.addressLine].filter(Boolean).join(' — '))),
      data.landmark ? row(t.landmark, esc(data.landmark)) : '',
      data.notes ? row(t.notes, esc(data.notes)) : '',
    ].join('')
  );
}

function plainText(data: OrderMailData, t: OrderStrings, heading: string): string {
  const money = (n: number) => formatPrice(n, data.currency, data.locale);

  return textBlock([
    heading,
    `${t.orderNumber}: ${data.orderNumber}`,
    '',
    ...data.items.map((i) => `  ${i.qty} x ${i.name} (${i.sku})  ${money(i.unitPrice * i.qty)}`),
    '',
    `${t.subtotal}: ${money(data.subtotal)}`,
    data.discount > 0 ? `${t.discount}: -${money(data.discount)}` : null,
    `${t.shipping}: ${money(data.shipping)}`,
    `${t.total}: ${money(data.total)}`,
    `${t.payment}: ${t.cod}`,
    '',
    `${t.customer}: ${data.customerName}`,
    `${t.phone}: ${data.phone}`,
    `${t.address}: ${[data.governorate, data.city, data.addressLine].filter(Boolean).join(' - ')}`,
    data.notes ? `${t.notes}: ${data.notes}` : null,
  ]);
}

function orderUrl(data: OrderMailData): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}/${data.locale}/order/${encodeURIComponent(data.orderNumber)}`;
}

/** Sent to the customer — only when they supplied an email at checkout. */
export function orderConfirmation(data: OrderMailData): Omit<Message, 'to'> {
  const t = T[data.locale];
  const url = orderUrl(data);

  const body = [
    table(row(t.orderNumber, `<strong dir="ltr">${esc(data.orderNumber)}</strong>`)),
    divider(),
    itemsTable(data, t),
    divider(),
    totalsTable(data, t),
    divider(),
    addressTable(data, t),
    `<div style="margin-top:22px;">
       <a href="${esc(url)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;
          padding:11px 20px;border-radius:8px;font-size:13px;font-weight:600;">${esc(t.viewOrder)}</a>
     </div>`,
  ].join('');

  return {
    subject: t.confirmSubject(data.orderNumber, data.storeName),
    html: layout({
      locale: data.locale,
      title: t.confirmTitle,
      intro: t.confirmIntro(data.customerName),
      body,
      footer: t.footer(data.storeName),
    }),
    text: `${plainText(data, t, t.confirmTitle)}\n\n${t.viewOrder}: ${url}`,
  };
}

/**
 * Sent to the store on every order.
 *
 * Unconditional, unlike the customer copy: the shop has to know a COD order
 * exists in order to fulfil it, and the customer's email is optional.
 */
export function orderAlert(data: OrderMailData): Omit<Message, 'to'> {
  const t = T[data.locale];

  const body = [
    table(row(t.orderNumber, `<strong dir="ltr">${esc(data.orderNumber)}</strong>`)),
    divider(),
    itemsTable(data, t),
    divider(),
    totalsTable(data, t),
    divider(),
    addressTable(data, t),
  ].join('');

  return {
    subject: t.alertSubject(data.orderNumber),
    html: layout({
      locale: data.locale,
      title: t.alertTitle,
      intro: t.alertIntro,
      body,
      footer: t.alertFooter,
    }),
    text: plainText(data, t, t.alertTitle),
    // Replying in the mail client reaches the customer directly.
    replyTo: data.email || undefined,
  };
}
