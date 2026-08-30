// components/admin/settings-form.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { socialPlatforms, type SettingsInput } from '@/lib/settings-schema';
import { MediaField } from './media-field';
import { useT } from './i18n-provider';
import { ThemeEditor } from './theme-editor';
import type { MessageKey } from '@/lib/admin-i18n';

const TABS: { id: string; key: MessageKey }[] = [
  { id: 'general', key: 'settings.tab.general' },
  { id: 'social', key: 'settings.tab.social' },
  { id: 'tracking', key: 'settings.tab.tracking' },
  { id: 'appearance', key: 'settings.tab.appearance' },
  { id: 'commerce', key: 'settings.tab.commerce' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const SOCIAL_LABEL: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  twitter: 'Twitter / X',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  tiktok: 'TikTok',
};

export function SettingsForm({ initial }: { initial: SettingsInput }) {
  const t = useT();
  const router = useRouter();
  const [value, setValue] = useState<SettingsInput>(initial);
  const [tab, setTab] = useState<TabId>('general');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (p: Partial<SettingsInput>) => {
    setValue((v) => ({ ...v, ...p }));
    setSaved(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(value),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        const issue = data?.error?.issues?.[0];
        throw new Error(
          issue ? `${issue.path?.join('.') ?? ''}: ${issue.message}` : data?.error?.message ?? t('common.saveFailed')
        );
      }

      setSaved(true);
      // Sidebar and layout read these values, so refresh the server tree.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} method="post" className="space-y-6" data-test-id="settings-form">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--admin-text)]">{t('settings.title')}</h1>
          <p className="mt-1 text-sm text-[var(--admin-text-muted)]">
            {t('settings.subtitle')}
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="admin-btn disabled:opacity-50"
          data-test-id="settings-save"
        >
          {saving ? (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          ) : saved ? (
            <Check size={16} aria-hidden="true" />
          ) : (
            <Save size={16} aria-hidden="true" />
          )}
          {saving ? t('common.saving') : saved ? t('common.saved') : t('common.save')}
        </button>
      </div>

      {error && (
        <p role="alert" className="admin-card border-[var(--admin-danger)] text-sm text-[var(--admin-danger)]">
          {error}
        </p>
      )}

      <div role="tablist" aria-label={t('settings.sections')} className="flex flex-wrap gap-1 border-b border-[var(--admin-line)]">
        {/* `item`, not `t` — the translator is in scope here and would be shadowed. */}
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            data-test-id={`settings-tab-${item.id}`}
            className={cn(
              'border-b-2 px-4 py-2 text-sm transition-colors',
              tab === item.id
                ? 'border-[var(--admin-accent)] text-[var(--admin-accent-soft)]'
                : 'border-transparent text-[var(--admin-text-secondary)] hover:text-[var(--admin-text)]'
            )}
          >
            {t(item.key)}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="admin-card space-y-4">
        {tab === 'general' && (
          <>
            <Field label={t('settings.siteName')} required>
              <input
                type="text"
                required
                className="admin-input"
                value={value.siteName}
                onChange={(e) => patch({ siteName: e.target.value })}
                data-test-id="settings-site-name"
              />
            </Field>

            <Field label={t('settings.siteDescription')}>
              <textarea
                rows={2}
                className="admin-input resize-y"
                value={value.siteDescription ?? ''}
                onChange={(e) => patch({ siteDescription: e.target.value })}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <MediaField
                label={t('settings.logo')}
                hint={t('settings.logoHint')}
                value={value.logo ?? ''}
                onChange={(logo) => patch({ logo })}
                testId="settings-logo"
              />

              <MediaField
                label={t('settings.favicon')}
                value={value.favicon ?? ''}
                onChange={(favicon) => patch({ favicon })}
                testId="settings-favicon"
              />

              <Field label={t('settings.contactEmail')}>
                <input
                  type="email"
                  dir="ltr"
                  className="admin-input text-start"
                  value={value.contactEmail ?? ''}
                  onChange={(e) => patch({ contactEmail: e.target.value })}
                />
              </Field>

              <Field label={t('settings.contactPhone')}>
                <input
                  type="tel"
                  dir="ltr"
                  className="admin-input text-start"
                  value={value.contactPhone ?? ''}
                  onChange={(e) => patch({ contactPhone: e.target.value })}
                />
              </Field>
            </div>

            <Toggle
              label={t('settings.comingSoon')}
              hint={t('settings.comingSoonHint')}
              checked={value.comingSoonMode}
              onChange={(comingSoonMode) => patch({ comingSoonMode })}
              testId="settings-coming-soon"
            />

            {value.comingSoonMode && (
              <Field label={t('settings.comingSoonMessage')}>
                <textarea
                  rows={2}
                  className="admin-input resize-y"
                  value={value.comingSoonMessage ?? ''}
                  onChange={(e) => patch({ comingSoonMessage: e.target.value })}
                />
              </Field>
            )}
          </>
        )}

        {tab === 'social' && (
          <div className="grid gap-4 sm:grid-cols-2">
            {socialPlatforms.map((p) => (
              <Field key={p} label={SOCIAL_LABEL[p] ?? p}>
                <input
                  type="text"
                  dir="ltr"
                  className="admin-input text-start"
                  placeholder={`https://${p}.com/…`}
                  value={value.socialLinks?.[p] ?? ''}
                  onChange={(e) =>
                    patch({ socialLinks: { ...value.socialLinks, [p]: e.target.value } })
                  }
                  data-test-id={`settings-social-${p}`}
                />
              </Field>
            ))}
          </div>
        )}

        {tab === 'tracking' && (
          <>
            <p className="text-xs text-[var(--admin-text-muted)]">
              {t('settings.trackingIdHint')}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Google Tag Manager"><TrackInput v={value.gtmId} on={(gtmId) => patch({ gtmId })} ph="GTM-XXXXXXX" id="gtm" /></Field>
              <Field label="Google Analytics 4"><TrackInput v={value.ga4Id} on={(ga4Id) => patch({ ga4Id })} ph="G-XXXXXXXXXX" id="ga4" /></Field>
              <Field label="Meta Pixel"><TrackInput v={value.metaPixelId} on={(metaPixelId) => patch({ metaPixelId })} ph="000000000000000" id="meta" /></Field>
              <Field label="TikTok Pixel"><TrackInput v={value.tiktokPixelId} on={(tiktokPixelId) => patch({ tiktokPixelId })} ph="CXXXXXXXXXXXXXXXXXXX" id="tiktok" /></Field>
              <Field label="Snap Pixel"><TrackInput v={value.snapPixelId} on={(snapPixelId) => patch({ snapPixelId })} ph="00000000-0000-0000-0000-000000000000" id="snap" /></Field>
            </div>
            <p className="text-xs text-[var(--admin-text-muted)]">
              {t('settings.trackingHint')}
            </p>
          </>
        )}

        {tab === 'appearance' && (
          <>
            <Field label={t('settings.theme')} hint={t('settings.themeHint')}>
              <ThemeEditor
                value={value.theme ?? {}}
                onChange={(theme) => patch({ theme })}
                commerceEnabled={Boolean(value.eCommerceEnabled)}
              />
            </Field>

            <Field label={t('settings.customCss')} hint={t('settings.customCssHint')}>
            <textarea
              rows={12}
              dir="ltr"
              className="admin-input resize-y font-mono text-xs text-start"
              value={value.customCss ?? ''}
              onChange={(e) => patch({ customCss: e.target.value })}
              data-test-id="settings-custom-css"
              />
            </Field>
          </>
        )}

        {tab === 'commerce' && (
          <>
            <Toggle
              label={t('settings.commerceToggle')}
              hint={t('settings.commerceHint')}
              checked={value.eCommerceEnabled}
              onChange={(eCommerceEnabled) => patch({ eCommerceEnabled })}
              testId="settings-ecommerce"
            />

            <Field label={t('settings.currency')} hint={t('settings.currencyHint')}>
              <input
                type="text"
                dir="ltr"
                maxLength={3}
                className="admin-input w-32 text-start uppercase"
                value={value.currency}
                onChange={(e) => patch({ currency: e.target.value.toUpperCase() })}
                data-test-id="settings-currency"
              />
            </Field>

            {value.eCommerceEnabled && (
              <p className="text-xs text-[var(--admin-warning)]">
                {t('settings.commerceWarning')}
              </p>
            )}
          </>
        )}
      </div>
    </form>
  );
}

function TrackInput({
  v,
  on,
  ph,
  id,
}: {
  v?: string;
  on: (value: string) => void;
  ph: string;
  id: string;
}) {
  return (
    <input
      type="text"
      dir="ltr"
      className="admin-input text-start"
      placeholder={ph}
      value={v ?? ''}
      onChange={(e) => on(e.target.value)}
      data-test-id={`settings-${id}`}
    />
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-[var(--admin-text-secondary)]">
        {label}
        {required && <span className="ms-1 text-[var(--admin-danger)]">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--admin-text-muted)]">{hint}</span>}
    </label>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  testId,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  testId: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-[var(--admin-line)] p-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-1 text-xs text-[var(--admin-text-muted)]">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        data-test-id={testId}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-[var(--admin-accent)]' : 'bg-[var(--admin-line)]'
        )}
      >
        {/* start-0.5 + translate — logical, so the knob travels the correct
            way under dir="rtl". */}
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-0.5 start-0.5 h-5 w-5 rounded-full bg-white transition-transform',
            checked && 'rtl:-translate-x-5 ltr:translate-x-5'
          )}
        />
      </button>
    </div>
  );
}
