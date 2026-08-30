'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * Sign in with a phone and a one-time code.
 *
 * Phone rather than email and password: this is a cash-on-delivery shop, the
 * order was placed with a phone number, and that number is already the key
 * that ties orders to a person. Asking for an email would mean asking for
 * something the shop does not reliably have.
 */
const COPY = {
  ar: {
    title: 'حسابي',
    intro: 'أدخل رقم هاتفك وسنرسل لك رمز دخول.',
    phone: 'رقم الهاتف',
    send: 'أرسل الرمز',
    code: 'رمز الدخول',
    verify: 'دخول',
    sent: 'إن كان لهذا الرقم طلبات سابقة، سيصلك رمز خلال لحظات.',
    back: 'رقم آخر',
    failed: 'تعذّر إتمام الطلب.',
  },
  en: {
    title: 'My account',
    intro: 'Enter your phone number and we will send you a sign-in code.',
    phone: 'Phone number',
    send: 'Send code',
    code: 'Sign-in code',
    verify: 'Sign in',
    sent: 'If this number has ordered before, a code is on its way.',
    back: 'Use a different number',
    failed: 'Something went wrong.',
  },
} as const;

export function AccountLogin({ locale }: { locale: 'ar' | 'en' }) {
  const c = COPY[locale];
  const router = useRouter();
  const [stage, setStage] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    return { res, json: await res.json().catch(() => null) };
  };

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const { res, json } = await post('/api/account/request-code', { phone, locale });
      if (!res.ok || !json?.success) {
        setError(json?.error?.message ?? c.failed);
        return;
      }
      // Always advances, because the response is the same whether or not the
      // number has an account — telling them here would leak who shops here.
      setStage('code');
    } catch {
      setError(c.failed);
    } finally {
      setBusy(false);
    }
  };

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const { res, json } = await post('/api/account/verify-code', { phone, code });
      if (!res.ok || !json?.success) {
        setError(json?.error?.message ?? c.failed);
        return;
      }
      router.refresh();
    } catch {
      setError(c.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm" data-test-id="account-login">
      <h1 className="text-2xl font-bold text-site-ink">{c.title}</h1>

      {stage === 'phone' ? (
        <form
          className="mt-6 flex flex-col gap-3"
          onSubmit={(e) => { e.preventDefault(); void sendCode(); }}
        >
          <p className="text-sm text-site-ink-muted">{c.intro}</p>
          <label className="flex flex-col gap-1 text-sm">
            {c.phone}
            <input
              type="tel"
              dir="ltr"
              autoComplete="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-lg border border-site-line px-3 py-2.5 text-sm"
              data-test-id="account-phone"
            />
          </label>
          <button type="submit" disabled={busy} className="site-btn-primary justify-center" data-test-id="account-send">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {c.send}
          </button>
        </form>
      ) : (
        <form
          className="mt-6 flex flex-col gap-3"
          onSubmit={(e) => { e.preventDefault(); void signIn(); }}
        >
          <p className="text-sm text-site-ink-muted">{c.sent}</p>
          <label className="flex flex-col gap-1 text-sm">
            {c.code}
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              dir="ltr"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="rounded-lg border border-site-line px-3 py-2.5 text-center text-lg tracking-[0.4em]"
              data-test-id="account-code"
            />
          </label>
          <button type="submit" disabled={busy} className="site-btn-primary justify-center" data-test-id="account-verify">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {c.verify}
          </button>
          <button
            type="button"
            onClick={() => { setStage('phone'); setCode(''); setError(null); }}
            className="text-sm text-site-ink-muted underline underline-offset-2"
          >
            {c.back}
          </button>
        </form>
      )}

      {error && (
        <p className="mt-3 text-sm text-site-danger" data-test-id="account-error">
          {error}
        </p>
      )}
    </div>
  );
}
