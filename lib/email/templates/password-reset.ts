// lib/email/templates/password-reset.ts
import 'server-only';
import { layout, esc, textBlock, type MailLocale } from '../render';
import type { Message } from '../transport';

export interface PasswordResetMailData {
  locale: MailLocale;
  storeName: string;
  userName: string;
  resetUrl: string;
  expiresInMinutes: number;
}

const T = {
  ar: {
    subject: (s: string) => `${s} — إعادة تعيين كلمة المرور`,
    title: 'إعادة تعيين كلمة المرور',
    intro: (name: string) => `مرحباً ${name}، وصلنا طلب لإعادة تعيين كلمة مرور حسابك.`,
    action: 'تعيين كلمة مرور جديدة',
    expiry: (n: number) => `هذا الرابط صالح لمدة ${n} دقيقة، ويُستخدم مرة واحدة فقط.`,
    ignore:
      'إذا لم تطلب هذا، تجاهل الرسالة — لن يتغيّر شيء، وكلمة مرورك الحالية تبقى كما هي.',
    footer: (s: string) => `${s} — لوحة التحكم.`,
  },
  en: {
    subject: (s: string) => `${s} — reset your password`,
    title: 'Reset your password',
    intro: (name: string) => `Hi ${name}, we received a request to reset your account password.`,
    action: 'Set a new password',
    expiry: (n: number) => `This link is valid for ${n} minutes and can only be used once.`,
    ignore:
      'If you did not request this, ignore this email — nothing changes and your current password still works.',
    footer: (s: string) => `${s} — admin panel.`,
  },
} as const;

export function passwordReset(data: PasswordResetMailData): Omit<Message, 'to'> {
  const t = T[data.locale];

  const body = `
    <p style="margin:0 0 18px 0;">${esc(t.expiry(data.expiresInMinutes))}</p>
    <div style="margin:22px 0;">
      <a href="${esc(data.resetUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;
         text-decoration:none;padding:11px 20px;border-radius:8px;font-size:13px;font-weight:600;">
        ${esc(t.action)}
      </a>
    </div>
    <p style="margin:0;color:#64748b;font-size:13px;">${esc(t.ignore)}</p>`;

  return {
    subject: t.subject(data.storeName),
    html: layout({
      locale: data.locale,
      title: t.title,
      intro: t.intro(data.userName),
      body,
      footer: t.footer(data.storeName),
    }),
    text: textBlock([
      t.title,
      t.intro(data.userName),
      '',
      `${t.action}: ${data.resetUrl}`,
      '',
      t.expiry(data.expiresInMinutes),
      t.ignore,
    ]),
  };
}
