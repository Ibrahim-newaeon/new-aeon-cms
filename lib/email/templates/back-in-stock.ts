// lib/email/templates/back-in-stock.ts
import 'server-only';
import { layout, esc, row, table, textBlock, type MailLocale } from '../render';
import type { Message } from '../transport';

export interface BackInStockMailData {
  locale: MailLocale;
  storeName: string;
  productName: string;
  sku: string;
  url: string;
}

const T = {
  ar: {
    subject: (p: string) => `${p} — عاد للتوفّر`,
    title: 'المنتج عاد للتوفّر',
    intro: 'طلبت أن نُعلمك عند توفّر هذا المنتج، وقد عاد.',
    product: 'المنتج',
    sku: 'الرمز',
    action: 'اطلبه الآن',
    // Said plainly: a restock is not a reservation, and a shopper who arrives
    // to find it gone again should not feel misled.
    hurry: 'الكمية محدودة ولا يمكننا حجزها. الأسبقية لمن يطلب أولاً.',
    footer: (s: string) => `${s} — يصلك هذا البريد لأنك طلبت إشعاراً عند التوفّر. لن يتكرّر.`,
  },
  en: {
    subject: (p: string) => `${p} — back in stock`,
    title: 'It is back in stock',
    intro: 'You asked to be told when this came back, and it has.',
    product: 'Product',
    sku: 'SKU',
    action: 'Order it now',
    hurry: 'Stock is limited and cannot be reserved — orders are filled in the order they arrive.',
    footer: (s: string) => `${s} — you asked to be notified about this item. This is the only such email.`,
  },
} as const;

export function backInStock(data: BackInStockMailData): Omit<Message, 'to'> {
  const t = T[data.locale];

  const body = [
    table(
      [
        row(t.product, `<strong>${esc(data.productName)}</strong>`),
        row(t.sku, esc(data.sku), { ltr: true }),
      ].join('')
    ),
    `<div style="margin-top:22px;">
       <a href="${esc(data.url)}" style="display:inline-block;background:#0f172a;color:#ffffff;
          text-decoration:none;padding:11px 20px;border-radius:8px;font-size:13px;font-weight:600;">
         ${esc(t.action)}
       </a>
     </div>`,
    `<p style="margin:18px 0 0 0;color:#64748b;font-size:13px;">${esc(t.hurry)}</p>`,
  ].join('');

  return {
    subject: t.subject(data.productName),
    html: layout({
      locale: data.locale,
      title: t.title,
      intro: t.intro,
      body,
      footer: t.footer(data.storeName),
    }),
    text: textBlock([
      t.title,
      t.intro,
      '',
      `${t.product}: ${data.productName}`,
      `${t.sku}: ${data.sku}`,
      '',
      `${t.action}: ${data.url}`,
      '',
      t.hurry,
    ]),
  };
}
