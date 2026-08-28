// lib/email/templates/form.ts
import 'server-only';
import { layout, esc, row, table, textBlock, type MailLocale } from '../render';
import type { Message } from '../transport';

export interface FormMailData {
  type: 'contact' | 'newsletter';
  locale: MailLocale;
  fields: Record<string, string>;
  pageSlug?: string | null;
  submittedAt: Date;
}

const T = {
  ar: {
    contactSubject: 'رسالة جديدة من نموذج التواصل',
    newsletterSubject: 'اشتراك جديد في النشرة البريدية',
    contactTitle: 'رسالة جديدة',
    newsletterTitle: 'اشتراك جديد',
    intro: 'وصل إرسال جديد من الموقع.',
    page: 'الصفحة',
    time: 'الوقت',
    footer: 'إشعار تلقائي من نظام الموقع.',
  },
  en: {
    contactSubject: 'New contact form message',
    newsletterSubject: 'New newsletter signup',
    contactTitle: 'New message',
    newsletterTitle: 'New signup',
    intro: 'A new submission arrived from the website.',
    page: 'Page',
    time: 'Time',
    footer: 'Automated notification from the website.',
  },
} as const;

/**
 * Turns a form field key into something readable. Keys arrive as whatever the
 * block editor named them (`full_name`, `phoneNumber`), and the store owner
 * should not have to read snake_case in their inbox.
 */
function humanise(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * A single "someone submitted a form" notification to the store.
 *
 * Every value here is attacker-supplied — this is a public, unauthenticated
 * endpoint — so all of it goes through `esc`. The reply-to is deliberately NOT
 * set from a submitted email field: it is unverified, and honouring it would
 * let anyone direct the store's replies wherever they liked.
 */
export function formAlert(data: FormMailData): Omit<Message, 'to'> {
  const t = T[data.locale];
  const isContact = data.type === 'contact';

  const fieldRows = Object.entries(data.fields)
    .filter(([, value]) => String(value ?? '').trim() !== '')
    .map(([key, value]) =>
      row(humanise(key), esc(value).replace(/\n/g, '<br>'))
    )
    .join('');

  const metaRows = [
    data.pageSlug ? row(t.page, esc(data.pageSlug)) : '',
    row(t.time, esc(data.submittedAt.toISOString().replace('T', ' ').slice(0, 19)), { ltr: true }),
  ].join('');

  return {
    subject: isContact ? t.contactSubject : t.newsletterSubject,
    html: layout({
      locale: data.locale,
      title: isContact ? t.contactTitle : t.newsletterTitle,
      intro: t.intro,
      body: table(fieldRows + metaRows),
      footer: t.footer,
    }),
    text: textBlock([
      isContact ? t.contactTitle : t.newsletterTitle,
      '',
      ...Object.entries(data.fields).map(([k, v]) => `${humanise(k)}: ${v}`),
      '',
      data.pageSlug ? `${t.page}: ${data.pageSlug}` : null,
      `${t.time}: ${data.submittedAt.toISOString()}`,
    ]),
  };
}
