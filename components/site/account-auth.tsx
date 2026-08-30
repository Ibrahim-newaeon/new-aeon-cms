'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * Sign in or open an account.
 *
 * Three ways in, because this shop already has customers who have never had an
 * account: a password, a one-time code, or registering. The form asks for the
 * phone first and then asks the server what that number is, so a returning
 * buyer is offered the right path instead of guessing at a password they never
 * set.
 */
type Mode = 'phone' | 'password' | 'code' | 'register';

const COPY = {
  ar: {
    title: 'حسابي',
    intro: 'أدخل رقم هاتفك للمتابعة.',
    phone: 'رقم الهاتف',
    next: 'متابعة',
    password: 'كلمة المرور',
    signIn: 'دخول',
    forgot: 'نسيت كلمة المرور؟ ادخل برمز',
    code: 'رمز الدخول',
    verify: 'تأكيد',
    sent: 'أرسلنا رمزاً إلى هاتفك.',
    name: 'الاسم',
    email: 'البريد (اختياري)',
    createPassword: 'كلمة مرور جديدة',
    createAccount: 'إنشاء الحساب',
    newHere: 'رقم جديد — أنشئ حسابك.',
    hasOrders: 'لهذا الرقم طلبات سابقة. سنرسل رمزاً لتأكيد ملكيته.',
    back: 'رقم آخر',
    failed: 'تعذّر إتمام الطلب.',
    minChars: '٨ أحرف على الأقل',
  },
  en: {
    title: 'My account',
    intro: 'Enter your phone number to continue.',
    phone: 'Phone number',
    next: 'Continue',
    password: 'Password',
    signIn: 'Sign in',
    forgot: 'Forgot it? Sign in with a code',
    code: 'Sign-in code',
    verify: 'Verify',
    sent: 'We sent a code to your phone.',
    name: 'Name',
    email: 'Email (optional)',
    createPassword: 'Choose a password',
    createAccount: 'Create account',
    newHere: 'New number — create your account.',
    hasOrders: 'This number has past orders. We will send a code to confirm it is yours.',
    back: 'Use a different number',
    failed: 'Something went wrong.',
    minChars: 'At least 8 characters',
  },
} as const;

export function AccountAuth({ locale }: { locale: 'ar' | 'en' }) {
  const c = COPY[locale];
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('phone');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneProof, setPhoneProof] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = async (url: string, body: unknown, method = 'POST') => {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    return { res, json: await res.json().catch(() => null) };
  };

  const sendCode = async () => {
    const { res, json } = await post('/api/account/request-code', { phone, locale });
    if (!res.ok || !json?.success) {
      setError(json?.error?.message ?? c.failed);
      return false;
    }
    setNotice(c.sent);
    setMode('code');
    return true;
  };

  /** Ask what this number is before asking for anything else. */
  const continueWithPhone = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/account/register?phone=${encodeURIComponent(phone)}`, {
        credentials: 'same-origin',
      });
      const json = await res.json();
      const state = json?.data?.state as 'free' | 'unclaimed' | 'registered' | 'invalid';

      if (state === 'invalid') {
        setError(locale === 'ar' ? 'رقم هاتف غير صالح' : 'That is not a valid phone number.');
        return;
      }
      if (state === 'registered') {
        setMode('password');
        return;
      }
      if (state === 'unclaimed') {
        // Known buyer, no account yet. Taking over that number means taking
        // over their order history, so it goes through a code first.
        setNotice(c.hasOrders);
        await sendCode();
        return;
      }
      setNotice(c.newHere);
      setMode('register');
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
      const { res, json } = await post('/api/account/login', { phone, password });
      if (!res.ok || !json?.success) {
        if (json?.data?.state === 'not-registered') {
          await sendCode();
          return;
        }
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

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const { res, json } = await post('/api/account/verify-code', { phone, code });
      if (!res.ok || !json?.success) {
        setError(json?.error?.message ?? c.failed);
        return;
      }
      if (json.data?.registered) {
        // Signed in. A buyer with no password is sent to set one rather than
        // being left needing a code every single time.
        if (json.data?.needsPassword) {
          router.push(`/${locale}/account/profile`);
          return;
        }
        router.refresh();
        return;
      }
      // Number proven, no account behind it: finish registering.
      setPhoneProof(json.data?.phoneProof ?? null);
      setNotice(null);
      setMode('register');
    } catch {
      setError(c.failed);
    } finally {
      setBusy(false);
    }
  };

  const createAccount = async () => {
    setBusy(true);
    setError(null);
    try {
      const { res, json } = await post('/api/account/register', {
        phone, name, password, email, phoneProof,
      });
      if (!res.ok || !json?.success) {
        if (json?.data?.state === 'needs-verification') {
          setNotice(c.hasOrders);
          await sendCode();
          return;
        }
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
    setMode('phone');
    setPassword(''); setCode(''); setPhoneProof(null);
    setError(null); setNotice(null);
  };

  const field = 'rounded-lg border border-site-line px-3 py-2.5 text-sm';

  return (
    <div className="mx-auto max-w-sm" data-test-id="account-auth">
      <h1 className="text-2xl font-bold text-site-ink">{c.title}</h1>

      {notice && <p className="mt-3 text-sm text-site-ink-muted" data-test-id="account-notice">{notice}</p>}

      {mode === 'phone' && (
        <form className="mt-6 flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void continueWithPhone(); }}>
          <p className="text-sm text-site-ink-muted">{c.intro}</p>
          <label className="flex flex-col gap-1 text-sm">
            {c.phone}
            <input type="tel" dir="ltr" autoComplete="tel" required value={phone}
              onChange={(e) => setPhone(e.target.value)} className={field} data-test-id="account-phone" />
          </label>
          <button type="submit" disabled={busy} className="site-btn-primary justify-center" data-test-id="account-continue">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {c.next}
          </button>
        </form>
      )}

      {mode === 'password' && (
        <form className="mt-6 flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void signIn(); }}>
          <label className="flex flex-col gap-1 text-sm">
            {c.password}
            <input type="password" autoComplete="current-password" required value={password}
              onChange={(e) => setPassword(e.target.value)} className={field} data-test-id="account-password" />
          </label>
          <button type="submit" disabled={busy} className="site-btn-primary justify-center" data-test-id="account-signin">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {c.signIn}
          </button>
          <button type="button" onClick={() => void sendCode()} className="text-sm text-site-ink-muted underline underline-offset-2" data-test-id="account-forgot">
            {c.forgot}
          </button>
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

      {mode !== 'phone' && (
        <button type="button" onClick={reset} className="mt-3 text-sm text-site-ink-muted underline underline-offset-2">
          {c.back}
        </button>
      )}

      {error && <p className="mt-3 text-sm text-site-danger" data-test-id="account-error">{error}</p>}
    </div>
  );
}
