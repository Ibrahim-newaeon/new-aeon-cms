'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Check } from 'lucide-react';

const COPY = {
  ar: {
    name: 'الاسم', email: 'البريد الإلكتروني', phone: 'رقم الهاتف',
    phoneNote: 'رقم الهاتف هو هويتك هنا ولا يمكن تغييره — به تُربط طلباتك.',
    password: 'كلمة مرور جديدة', passwordNote: 'اتركها فارغة إن لم ترد تغييرها. ٨ أحرف على الأقل.',
    setPassword: 'أنشئ كلمة مرور',
    setPasswordNote: 'أنشئ كلمة مرور لتدخل بها لاحقاً بدل طلب رمز في كل مرة. ٨ أحرف على الأقل.',
    save: 'حفظ', saved: 'تم الحفظ', failed: 'تعذّر الحفظ.',
  },
  en: {
    name: 'Name', email: 'Email', phone: 'Phone number',
    phoneNote: 'Your phone is your identity here and cannot be changed — it is what your orders are tied to.',
    password: 'New password', passwordNote: 'Leave blank to keep the current one. At least 8 characters.',
    setPassword: 'Set a password',
    setPasswordNote: 'Set one so you can sign in without asking for a code every time. At least 8 characters.',
    save: 'Save', saved: 'Saved', failed: 'Could not save.',
  },
} as const;

export function ProfileForm({
  locale,
  initial,
}: {
  locale: 'ar' | 'en';
  initial: { name: string; email: string | null; phone: string; hasPassword: boolean };
}) {
  const c = COPY[locale];
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = 'w-full rounded-lg border border-site-line px-3 py-2.5 text-sm';

  return (
    <form
      className="flex max-w-md flex-col gap-4"
      data-test-id="profile-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError(null); setDone(false);
        try {
          const res = await fetch('/api/account/profile', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ name, email, password }),
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.success) { setError(json?.error?.message ?? c.failed); return; }
          setPassword('');
          setDone(true);
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        {c.name}
        <input required minLength={2} value={name} onChange={(e) => setName(e.target.value)}
          className={field} autoComplete="name" data-test-id="profile-name" />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {c.email}
        <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)}
          className={field} autoComplete="email" data-test-id="profile-email" />
      </label>

      <div className="flex flex-col gap-1 text-sm">
        {c.phone}
        {/* Read-only on purpose: it is the identity this session proves and the
            key that ties orders to this person. Changing it means proving the
            new number, which is the register flow, not a text field. */}
        <input value={initial.phone} readOnly dir="ltr"
          className={`${field} bg-site-surface-raised text-site-ink-muted`} data-test-id="profile-phone" />
        <span className="text-xs text-site-ink-muted">{c.phoneNote}</span>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        {initial.hasPassword ? c.password : c.setPassword}
        <input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
          className={field} autoComplete="new-password" data-test-id="profile-password" />
        {/* Different hint when there is no current password: "leave blank to
            keep the current one" is nonsense to someone who has none, and this
            page is exactly where a code sign-in sends them. */}
        <span className="text-xs text-site-ink-muted">
          {initial.hasPassword ? c.passwordNote : c.setPasswordNote}
        </span>
      </label>

      {error && <p className="text-sm text-site-danger" data-test-id="profile-error">{error}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className="site-btn-primary" data-test-id="profile-save">
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          {c.save}
        </button>
        {done && (
          <span className="inline-flex items-center gap-1 text-sm text-site-success" data-test-id="profile-saved">
            <Check size={14} aria-hidden="true" />
            {c.saved}
          </span>
        )}
      </div>
    </form>
  );
}
