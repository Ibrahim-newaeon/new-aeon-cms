// app/(auth)/admin/forgot/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, MailCheck } from 'lucide-react';
import { useT } from '@/components/admin/i18n-provider';

const ADMIN_PATH = process.env.NEXT_PUBLIC_ADMIN_PATH || '/admin';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const t = useT();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email }),
      });
    } catch {
      // Swallowed on purpose. The endpoint answers 200 whatever happens, so
      // there is no outcome to report — and a network error message here would
      // be the only way to tell a real address from an unknown one.
    } finally {
      // Always the same confirmation, even for an address with no account.
      setSent(true);
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--admin-bg)]">
        <div className="w-full max-w-md p-8 text-center" data-test-id="forgot-sent">
          <MailCheck
            size={40}
            aria-hidden="true"
            className="mx-auto mb-4 text-[var(--admin-accent)]"
          />
          <h1 className="text-xl font-bold text-[var(--admin-text)]">{t('auth.resetSentTitle')}</h1>
          <p className="mt-3 text-sm text-[var(--admin-text-muted)]">{t('auth.resetSentBody')}</p>
          <Link
            href={`${ADMIN_PATH}/login`}
            className="admin-btn-ghost mt-6 inline-flex"
            data-test-id="forgot-back"
          >
            {t('auth.backToLogin')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--admin-bg)]">
      <div className="w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-[var(--admin-text)]">{t('auth.forgotTitle')}</h1>
          <p className="mt-2 text-[var(--admin-text-muted)]">{t('auth.forgotSubtitle')}</p>
        </div>

        {/* method="post" for the same reason as the login form: an unhydrated
            page must not fall back to a native GET and put the address in the
            URL and the access logs. */}
        <form method="post" onSubmit={handleSubmit} className="space-y-4" data-test-id="forgot-form">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium">
              {t('auth.email')}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="admin-input text-start"
              data-test-id="forgot-email"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="admin-btn-primary w-full disabled:opacity-50"
            data-test-id="forgot-submit"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={18} aria-hidden="true" />
                <span>{t('auth.sending')}</span>
              </>
            ) : (
              t('auth.sendResetLink')
            )}
          </button>

          <Link
            href={`${ADMIN_PATH}/login`}
            className="block pt-2 text-center text-sm text-[var(--admin-text-muted)] hover:text-[var(--admin-text)]"
          >
            {t('auth.backToLogin')}
          </Link>
        </form>
      </div>
    </div>
  );
}
