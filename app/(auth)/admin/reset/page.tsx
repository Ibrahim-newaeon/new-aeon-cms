// app/(auth)/admin/reset/page.tsx
'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { useT } from '@/components/admin/i18n-provider';

const ADMIN_PATH = process.env.NEXT_PUBLIC_ADMIN_PATH || '/admin';
const MIN_LENGTH = 12;

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const t = useT();

  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Checked here purely to save a round trip; the server enforces both rules
    // regardless of what this form does.
    if (password !== confirm) {
      setError(t('auth.passwordsDiffer'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error?.message ?? t('auth.resetFailed'));
      }

      // Straight to login. The reset revoked every session this user had, so
      // there is nothing to return to.
      router.push(`${ADMIN_PATH}/login?reset=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.resetFailed'));
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="w-full max-w-md p-8 text-center">
        <h1 className="text-xl font-bold text-[var(--admin-text)]">{t('auth.resetNoToken')}</h1>
        <Link href={`${ADMIN_PATH}/forgot`} className="admin-btn-ghost mt-6 inline-flex">
          {t('auth.sendResetLink')}
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md p-8">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-[var(--admin-text)]">{t('auth.resetTitle')}</h1>
        <p className="mt-2 text-sm text-[var(--admin-text-muted)]">
          {t('auth.passwordRule', { count: MIN_LENGTH })}
        </p>
      </div>

      <form method="post" onSubmit={handleSubmit} className="space-y-4" data-test-id="reset-form">
        {error && (
          <div role="alert" className="rounded-md bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium">
            {t('auth.newPassword')}
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={show ? 'text' : 'password'}
              required
              minLength={MIN_LENGTH}
              autoComplete="new-password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="admin-input text-start pe-10"
              data-test-id="reset-password"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}
              className="absolute inset-y-0 end-0 flex items-center px-3 text-[var(--admin-text-muted)]"
              data-test-id="reset-toggle-password"
            >
              {show ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="confirm" className="mb-2 block text-sm font-medium">
            {t('auth.confirmPassword')}
          </label>
          <input
            id="confirm"
            name="confirm"
            type={show ? 'text' : 'password'}
            required
            minLength={MIN_LENGTH}
            autoComplete="new-password"
            dir="ltr"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="admin-input text-start"
            data-test-id="reset-confirm"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="admin-btn-primary w-full disabled:opacity-50"
          data-test-id="reset-submit"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={18} aria-hidden="true" />
              <span>{t('common.saving')}</span>
            </>
          ) : (
            t('auth.resetSubmit')
          )}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--admin-bg)]">
      {/* useSearchParams needs a Suspense boundary or the whole route opts out
          of static rendering with a build-time error. */}
      <Suspense fallback={<Loader2 className="animate-spin" aria-hidden="true" />}>
        <ResetForm />
      </Suspense>
    </div>
  );
}
