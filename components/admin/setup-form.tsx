'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Check } from 'lucide-react';
import { useT } from './i18n-provider';

/**
 * First-run setup.
 *
 * One screen with numbered sections rather than paged steps. There are six
 * fields; splitting them across three pages would add two clicks and two
 * chances to abandon, and would hide from the reader how short the whole thing
 * is. The numbering carries the sense of a sequence without the pagination.
 */
export function SetupForm({ adminPath }: { adminPath: string }) {
  const t = useT();
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState({
    name: '',
    email: '',
    password: '',
    siteName: '',
    defaultLocale: 'ar' as 'ar' | 'en',
    commerce: true,
    demoContent: true,
  });

  const set = <K extends keyof typeof value>(k: K, v: (typeof value)[K]) =>
    setValue((prev) => ({ ...prev, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(value),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setError(json?.error?.message ?? t('setup.failed'));
        return;
      }

      // The route signs us in, so this lands on a working dashboard rather
      // than a login form asking for the password just chosen.
      router.replace(adminPath);
      router.refresh();
    } catch {
      setError(t('setup.failed'));
    } finally {
      setBusy(false);
    }
  };

  const field = 'admin-input';
  const label = 'mb-1 block text-sm text-[var(--admin-text-secondary)]';
  const hint = 'mt-1 text-xs text-[var(--admin-text-muted)]';

  return (
    <form onSubmit={submit} className="space-y-8" data-test-id="setup-form">
      <header>
        <h1 className="text-2xl font-bold text-[var(--admin-text)]">{t('setup.heading')}</h1>
        <p className="mt-2 text-sm text-[var(--admin-text-secondary)]">{t('setup.intro')}</p>
      </header>

      <Section n={1} title={t('setup.sectionAccount')}>
        <label className="block">
          <span className={label}>{t('setup.name')}</span>
          <input
            className={field} required maxLength={255} autoComplete="name"
            value={value.name} onChange={(e) => set('name', e.target.value)}
            data-test-id="setup-name"
          />
        </label>

        <label className="block">
          <span className={label}>{t('setup.email')}</span>
          <input
            type="email" dir="ltr" className={`${field} text-start`} required autoComplete="username"
            value={value.email} onChange={(e) => set('email', e.target.value)}
            data-test-id="setup-email"
          />
        </label>

        <label className="block">
          <span className={label}>{t('setup.password')}</span>
          <input
            type="password" dir="ltr" className={`${field} text-start`} required minLength={12}
            autoComplete="new-password"
            value={value.password} onChange={(e) => set('password', e.target.value)}
            data-test-id="setup-password"
          />
          <p className={hint}>{t('setup.passwordHint')}</p>
        </label>
      </Section>

      <Section n={2} title={t('setup.sectionSite')}>
        <label className="block">
          <span className={label}>{t('setup.siteName')}</span>
          <input
            className={field} required maxLength={255}
            value={value.siteName} onChange={(e) => set('siteName', e.target.value)}
            data-test-id="setup-site-name"
          />
        </label>

        <label className="block">
          <span className={label}>{t('setup.language')}</span>
          <select
            className={field} value={value.defaultLocale}
            onChange={(e) => set('defaultLocale', e.target.value as 'ar' | 'en')}
            data-test-id="setup-locale"
          >
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </label>
      </Section>

      <Section n={3} title={t('setup.sectionContent')}>
        <Toggle
          checked={value.commerce}
          onChange={(v) => set('commerce', v)}
          label={t('setup.commerce')}
          hint={t('setup.commerceHint')}
          testId="setup-commerce"
        />
        {/* Only offered with the shop on: demo products on a site with no shop
            would create rows nobody can reach. */}
        {value.commerce && (
          <Toggle
            checked={value.demoContent}
            onChange={(v) => set('demoContent', v)}
            label={t('setup.demo')}
            hint={t('setup.demoHint')}
            testId="setup-demo"
          />
        )}
      </Section>

      {error && (
        <p className="text-sm text-[var(--admin-danger)]" role="alert" data-test-id="setup-error">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} className="admin-btn w-full disabled:opacity-60" data-test-id="setup-submit">
        {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
        {busy ? t('setup.working') : t('setup.submit')}
      </button>
    </form>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 text-sm font-medium text-[var(--admin-text)]">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--admin-accent)] text-xs font-bold text-[var(--admin-accent-ink)]">
          {n}
        </span>
        {title}
      </h2>
      <div className="space-y-4 ps-8">{children}</div>
    </section>
  );
}

function Toggle({
  checked, onChange, label, hint, testId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
  testId: string;
}) {
  return (
    <label className="block cursor-pointer">
      <span className="flex items-center gap-2 text-sm">
        <input
          type="checkbox" checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          data-test-id={testId}
        />
        {label}
      </span>
      <p className="mt-1 ps-6 text-xs text-[var(--admin-text-muted)]">{hint}</p>
    </label>
  );
}
