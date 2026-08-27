// app/(auth)/admin/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useT } from '@/components/admin/i18n-provider';

// NEXT_PUBLIC_ so the value is available in this Client Component. Keeping the
// hardcoded '/admin' here would send users to a 404 whenever ADMIN_PATH is
// customised.
const ADMIN_PATH = process.env.NEXT_PUBLIC_ADMIN_PATH || '/admin';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const t = useT();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, password }),
      });

      if (res.status === 429) {
        const retry = res.headers.get('Retry-After');
        throw new Error(
          retry
            ? `محاولات كثيرة. حاول بعد ${retry} ثانية.`
            : 'محاولات كثيرة. حاول لاحقاً.'
        );
      }

      // A 500 can return HTML, which would make res.json() throw and mask the
      // real status.
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error?.message ?? t('auth.invalid'));
      }

      router.push(ADMIN_PATH);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.failed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--admin-bg)]">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[var(--admin-text)]">{t('auth.login')}</h1>
          <p className="text-[var(--admin-text-muted)] mt-2">{t('auth.subtitle')}</p>
        </div>

        {/*
          method="post" matters even though submission is handled by fetch.
          If React has not hydrated (JS disabled, a chunk 404s, a slow network),
          the browser falls back to a NATIVE submit — and an HTML form with no
          method defaults to GET, which puts the password in the URL:
            /admin/login?email=...&password=admin123456
          That leaks into browser history, referrer headers and access logs.
          POST keeps the credentials in the request body.
        */}
        <form
          method="post"
          onSubmit={handleSubmit}
          className="space-y-4"
          data-test-id="login-form"
        >
          {error && (
            <div role="alert" className="p-3 rounded-md bg-red-500/10 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">
              {t('auth.email')}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="admin-input text-start"
              placeholder="admin@example.com"
              required
              data-test-id="login-email"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2">
              {t('auth.password')}
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="admin-input pe-10"
                placeholder="••••••••"
                required
                data-test-id="login-password"
              />
              {/* end-3, not left-3 — pairs with pe-10 in both directions. */}
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                aria-pressed={showPassword}
                data-test-id="login-toggle-password"
                className="absolute inset-y-0 end-3 flex items-center text-[var(--admin-text-muted)]"
              >
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="admin-btn-primary w-full disabled:opacity-50"
            data-test-id="login-submit"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={18} aria-hidden="true" />
                <span>{t('auth.loggingIn')}</span>
              </>
            ) : (
              t('auth.login')
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
