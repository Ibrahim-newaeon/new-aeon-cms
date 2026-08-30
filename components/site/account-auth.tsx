'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * Sign in, or open an account.
 *
 * Nothing here reveals whether a number is a customer of this shop. An earlier
 * version asked the server what a phone was so it could show the right form —
 * which answered "does this person shop here?" for anyone who cared to ask.
 * The customers table is names, numbers and addresses, so that question is not
 * one to answer.
 *
 * Instead the SHOPPER picks the path:
 *
 *   password  -> straight in, no SMS, and one message for every failure
 *   code      -> sent for any valid number, worded identically either way
 *
 * Only after a code is verified does the server say anything about the number,
 * and by then the person has proved they hold it. A buyer who never set a
 * password is not stranded by the single error message: the code route is on
 * the same screen and is how they get in and set one.
 */
type Mode = 'signin' | 'code' | 'register';

const COPY = {
  ar: {
    title: 'حسابي',
    intro: 'سجّل الدخول بكلمة المرور، أو اطلب رمزاً برسالة نصية.',
    phone: 'رقم الهاتف',
    password: 'كلمة المرور',
    signIn: 'دخول',
    useCode: 'أرسل لي رمزاً بدل ذلك',
    firstTime: 'أول مرة هنا؟ اطلب رمزاً لإنشاء حسابك.',
    code: 'رمز الدخول',
    verify: 'تأكيد',
    sent: 'إن كان بالإمكان الدخول بهذا الرقم، سيصلك رمز خلال لحظات.',
    name: 'الاسم',
    email: 'البريد (اختياري)',
    createPassword: 'كلمة مرور جديدة',
    createAccount: 'إنشاء الحساب',
    proven: 'تم تأكيد رقمك. أكمل بياناتك.',
    back: 'رجوع',
    failed: 'تعذّر إتمام الطلب.',
    minChars: '٨ أحرف على الأقل',
  },
  en: {
    title: 'My account',
    intro: 'Sign in with your password, or ask for a code by SMS.',
    phone: 'Phone number',
    password: 'Password',
    signIn: 'Sign in',
    useCode: 'Send me a code instead',
    firstTime: 'First time here? Ask for a code to create your account.',
    code: 'Sign-in code',
    verify: 'Verify',
    sent: 'If that number can sign in, a code is on its way.',
    name: 'Name',
    email: 'Email (optional)',
    createPassword: 'Choose a password',
    createAccount: 'Create account',
    proven: 'Number confirmed. Just your details now.',
    back: 'Back',
    failed: 'Something went wrong.',
    minChars: 'At least 8 characters',
  },
} as const;

export function AccountAuth({ locale }: { locale: 'ar' | 'en' }) {
  const c = COPY[locale];
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('signin');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneProof, setPhoneProof] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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

  const signIn = async () => {
    setBusy(true); setError(null);
    try {
      const { res, json } = await post('/api/account/login', { phone, password });
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

  const sendCode = async () => {
    setBusy(true); setError(null);
    try {
      const { res, json } = await post('/api/account/request-code', { phone, locale });
      if (!res.ok || !json?.success) {
        setError(json?.error?.message ?? c.failed);
        return;
      }
      // Always advances, and always with the same wording — the response is
      // identical whether or not that number exists.
      setNotice(c.sent);
      setMode('code');
    } catch {
      setError(c.failed);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true); setError(null);
    try {
      const { res, json } = await post('/api/account/verify-code', { phone, code });
      if (!res.ok || !json?.success) {
        setError(json?.error?.message ?? c.failed);
        return;
      }
      if (json.data?.registered) {
        // Signed in. Someone with no password is sent to set one, or the only
        // way back in is another code every time.
        if (json.data?.needsPassword) {
          router.push(`/${locale}/account/profile`);
          return;
        }
        router.refresh();
        return;
      }
      // Number proven, nothing behind it: finish creating the account.
      setPhoneProof(json.data?.phoneProof ?? null);
      setNotice(c.proven);
      setMode('register');
    } catch {
      setError(c.failed);
    } finally {
      setBusy(false);
    }
  };

  const createAccount = async () => {
    setBusy(true); setError(null);
    try {
      const { res, json } = await post('/api/account/register', {
        phone, name, password, email, phoneProof,
      });
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

  const reset = () => {
    setMode('signin');
    setCode(''); setPhoneProof(null); setError(null); setNotice(null);
  };

  const field = 'rounded-lg border border-site-line px-3 py-2.5 text-sm';

  return (
    <div className="mx-auto max-w-sm" data-test-id="account-auth">
      <h1 className="text-2xl font-bold text-site-ink">{c.title}</h1>

      {notice && (
        <p className="mt-3 text-sm text-site-ink-muted" data-test-id="account-notice">{notice}</p>
      )}

      {mode === 'signin' && (
        <form className="mt-6 flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void signIn(); }}>
          <p className="text-sm text-site-ink-muted">{c.intro}</p>

          <label className="flex flex-col gap-1 text-sm">
            {c.phone}
            <input type="tel" dir="ltr" autoComplete="tel" required value={phone}
              onChange={(e) => setPhone(e.target.value)} className={field} data-test-id="account-phone" />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {c.password}
            <input type="password" autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} className={field} data-test-id="account-password" />
          </label>

          <button type="submit" disabled={busy || !password} className="site-btn-primary justify-center" data-test-id="account-signin">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {c.signIn}
          </button>

          {/* Same button for signing in without a password and for opening an
              account — they are the same request, and splitting them would put
              the shopper back in the position of having to know which they are. */}
          <button type="button" disabled={busy || !phone} onClick={() => void sendCode()}
            className="site-btn-outline justify-center" data-test-id="account-send-code">
            {c.useCode}
          </button>

          <p className="text-xs text-site-ink-muted">{c.firstTime}</p>
        </form>
      )}

      {mode === 'code' && (
        <form className="mt-6 flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
          <label className="flex flex-col gap-1 text-sm">
            {c.code}
            <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
              dir="ltr" required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className={`${field} text-center text-lg tracking-[0.4em]`} data-test-id="account-code" />
          </label>
          <button type="submit" disabled={busy} className="site-btn-primary justify-center" data-test-id="account-verify">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {c.verify}
          </button>
        </form>
      )}

      {mode === 'register' && (
        <form className="mt-6 flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void createAccount(); }}>
          <label className="flex flex-col gap-1 text-sm">
            {c.name}
            <input required minLength={2} value={name} onChange={(e) => setName(e.target.value)}
              className={field} autoComplete="name" data-test-id="account-name" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {c.email}
            <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)}
              className={field} autoComplete="email" data-test-id="account-email" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {c.createPassword}
            <input type="password" required minLength={8} value={password}
              onChange={(e) => setPassword(e.target.value)} className={field}
              autoComplete="new-password" data-test-id="account-new-password" />
            <span className="text-xs text-site-ink-muted">{c.minChars}</span>
          </label>
          <button type="submit" disabled={busy} className="site-btn-primary justify-center" data-test-id="account-create">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {c.createAccount}
          </button>
        </form>
      )}

      {mode !== 'signin' && (
        <button type="button" onClick={reset} className="mt-3 text-sm text-site-ink-muted underline underline-offset-2" data-test-id="account-back">
          {c.back}
        </button>
      )}

      {error && <p className="mt-3 text-sm text-site-danger" data-test-id="account-error">{error}</p>}
    </div>
  );
}
