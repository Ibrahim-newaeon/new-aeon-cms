// components/site/blocks/form-blocks.tsx
'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ContentBlock } from '@/lib/blocks/types';

type ContactBlock = Extract<ContentBlock, { type: 'contact-form' }>;
type NewsletterBlockType = Extract<ContentBlock, { type: 'newsletter' }>;

/**
 * These were Arabic-only, so the contact and newsletter blocks rendered Arabic
 * labels and error text on the English site. Both components already receive
 * `locale`; nothing was reading it.
 */
const COPY = {
  ar: {
    fields: {
      name: 'الاسم',
      email: 'البريد الإلكتروني',
      phone: 'رقم الهاتف',
      subject: 'الموضوع',
      message: 'الرسالة',
    } as Record<string, string>,
    sent: 'تم إرسال رسالتك بنجاح.',
    sendFailed: 'تعذّر الإرسال. حاول مرة أخرى.',
    submit: 'إرسال',
    subscribed: 'تم تسجيل اشتراكك.',
    subscribeFailed: 'تعذّر الاشتراك. حاول مرة أخرى.',
    subscribe: 'اشتراك',
    emailLabel: 'البريد الإلكتروني',
  },
  en: {
    fields: {
      name: 'Name',
      email: 'Email',
      phone: 'Phone',
      subject: 'Subject',
      message: 'Message',
    } as Record<string, string>,
    sent: 'Your message has been sent.',
    sendFailed: 'Could not send. Please try again.',
    submit: 'Send',
    subscribed: 'You are subscribed.',
    subscribeFailed: 'Could not subscribe. Please try again.',
    subscribe: 'Subscribe',
    emailLabel: 'Email',
  },
} as const;

type Status = 'idle' | 'sending' | 'sent' | 'error';

async function submit(
  type: 'contact' | 'newsletter',
  fields: Record<string, string>,
  website: string,
  locale: 'ar' | 'en'
) {
  const res = await fetch('/api/forms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      type,
      fields,
      website,
      locale,
      pageSlug: typeof window !== 'undefined' ? window.location.pathname : undefined,
    }),
  });
  if (!res.ok) throw new Error('failed');
}

/** Hidden input bots fill and humans never see. */
function Honeypot({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <label>
        Website
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}

export function ContactFormBlock({
  block,
  locale = 'ar',
}: {
  block: ContactBlock;
  locale?: 'ar' | 'en';
}) {
  const copy = COPY[locale];
  const [values, setValues] = useState<Record<string, string>>({});
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    try {
      await submit('contact', values, website, locale);
      setStatus('sent');
      setValues({});
    } catch {
      setStatus('error');
    }
  };

  if (status === 'sent') {
    return (
      <p role="status" className="rounded-lg bg-site-success/10 p-4 text-sm text-site-success">
        {block.successMessage ?? copy.sent}
      </p>
    );
  }

  return (
    <form onSubmit={handle} className="relative space-y-4" data-test-id="contact-form">
      <Honeypot value={website} onChange={setWebsite} />

      {block.fields.map((field) => (
        <label key={field} className="block">
          <span className="mb-1 block text-sm text-site-ink-muted">{copy.fields[field] ?? field}</span>
          {field === 'message' ? (
            <textarea
              required
              rows={4}
              className="w-full rounded-lg border border-site-line p-3 text-sm"
              value={values[field] ?? ''}
              onChange={(e) => setValues((p) => ({ ...p, [field]: e.target.value }))}
            />
          ) : (
            <input
              required
              type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
              dir={field === 'email' || field === 'phone' ? 'ltr' : undefined}
              className="w-full rounded-lg border border-site-line p-3 text-sm"
              value={values[field] ?? ''}
              onChange={(e) => setValues((p) => ({ ...p, [field]: e.target.value }))}
            />
          )}
        </label>
      ))}

      {status === 'error' && (
        <p role="alert" className="text-sm text-site-danger">
          {copy.sendFailed}
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'sending'}
        className="inline-flex items-center gap-2 rounded-lg bg-site-accent px-6 py-3 text-sm font-medium text-site-accent-ink hover:bg-site-accent-hover disabled:opacity-50"
      >
        {status === 'sending' && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
        {block.submitLabel ?? copy.submit}
      </button>
    </form>
  );
}

export function NewsletterBlock({
  block,
  locale = 'ar',
}: {
  block: NewsletterBlockType;
  locale?: 'ar' | 'en';
}) {
  const copy = COPY[locale];
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    try {
      await submit('newsletter', { email }, website, locale);
      setStatus('sent');
      setEmail('');
    } catch {
      setStatus('error');
    }
  };

  return (
    <section className="rounded-xl bg-site-surface-raised p-6">
      <h2 className="text-lg font-bold text-site-ink">{block.title}</h2>
      {block.description && <p className="mt-1 text-sm text-site-ink-muted">{block.description}</p>}

      {status === 'sent' ? (
        <p role="status" className="mt-4 text-sm text-site-success">
          {copy.subscribed}
        </p>
      ) : (
        <form onSubmit={handle} className="relative mt-4 flex flex-wrap gap-2">
          <Honeypot value={website} onChange={setWebsite} />
          <input
            required
            type="email"
            dir="ltr"
            aria-label={copy.emailLabel}
            className="min-w-0 flex-1 rounded-lg border border-site-line p-3 text-sm"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            type="submit"
            disabled={status === 'sending'}
            className="rounded-lg bg-site-accent px-5 py-3 text-sm font-medium text-site-accent-ink hover:bg-site-accent-hover disabled:opacity-50"
          >
            {block.buttonText ?? copy.subscribe}
          </button>
        </form>
      )}

      {status === 'error' && (
        <p role="alert" className="mt-2 text-sm text-site-danger">
          {copy.subscribeFailed}
        </p>
      )}

      {block.privacyNote && (
        <p className="mt-2 text-xs text-site-ink-muted">{block.privacyNote}</p>
      )}
    </section>
  );
}
