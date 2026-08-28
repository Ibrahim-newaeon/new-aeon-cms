// components/admin/page-form.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Save, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BlockBuilder } from './block-builder';
// Types and the factory live in a non-client module so the server pages can
// import them without crossing the client boundary.
import { TaxonomyPicker } from './taxonomy-picker';
import {
  emptyTranslation,
  type PageFormValue,
  type TaxonomyOption,
  type TranslationDraft,
} from '@/lib/content/page-draft';
import { useT } from './i18n-provider';
import type { MessageKey } from '@/lib/admin-i18n';

export type { PageFormValue, TranslationDraft };

const LOCALES: ReadonlyArray<'ar' | 'en'> = ['ar', 'en'];
const LOCALE_KEY: Record<'ar' | 'en', MessageKey> = { ar: 'form.localeAr', en: 'form.localeEn' };

interface PageFormProps {
  mode: 'create' | 'edit';
  contentId?: string;
  initial: PageFormValue;
  adminPath: string;
  /** Which content type this form writes. Drives the API payload and labels. */
  contentType?: 'page' | 'post';
  taxonomy?: {
    categories: TaxonomyOption[];
    tags: TaxonomyOption[];
    hasCategories: boolean;
    hasTags: boolean;
  };
}

const TYPE_LABEL: Record<'page' | 'post', { newTitle: MessageKey; editTitle: MessageKey; segment: string }> = {
  page: { newTitle: 'form.newPage', editTitle: 'form.editPage', segment: 'pages' },
  post: { newTitle: 'form.newPost', editTitle: 'form.editPost', segment: 'posts' },
};

export function PageForm({
  mode,
  contentId,
  initial,
  adminPath,
  contentType = 'page',
  taxonomy,
}: PageFormProps) {
  const t = useT();
  const labels = TYPE_LABEL[contentType];
  const router = useRouter();
  const [value, setValue] = useState<PageFormValue>(initial);
  const [activeLocale, setActiveLocale] = useState<'ar' | 'en'>('ar');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active =
    value.translations.find((t) => t.locale === activeLocale) ?? emptyTranslation(activeLocale);

  const patchTranslation = (patch: Partial<TranslationDraft>) => {
    setValue((prev) => {
      const exists = prev.translations.some((t) => t.locale === activeLocale);
      const translations = exists
        ? prev.translations.map((t) => (t.locale === activeLocale ? { ...t, ...patch } : t))
        : [...prev.translations, { ...emptyTranslation(activeLocale), ...patch }];
      return { ...prev, translations };
    });
  };

  /**
   * Locale trees are independent by design (see the brainstorming decision):
   * body lives on contentI18n, one row per locale, so no migration is needed.
   * The trade-off is drift — this copies the Arabic structure across when the
   * other locale is still empty.
   */
  const copyStructureFrom = (from: 'ar' | 'en') => {
    const source = value.translations.find((t) => t.locale === from);
    if (!source) return;
    if (active.body.length > 0 && !window.confirm(t('form.replaceSections'))) return;
    patchTranslation({ body: structuredClone(source.body) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // Locales the author never filled in would otherwise be saved as empty
    // rows, which the public site would render as a blank page.
    const payloadTranslations = value.translations.filter((t) => t.title.trim().length > 0);

    if (payloadTranslations.length === 0) {
      setError(t('form.titleRequired'));
      setSaving(false);
      return;
    }

    const payload = {
      slug: value.slug,
      status: value.status,
      ...(value.featuredImage ? { featuredImage: value.featuredImage } : {}),
      ...(mode === 'create' ? { type: contentType } : {}),
      categoryIds: value.categoryIds,
      tagIds: value.tagIds,
      translations: payloadTranslations.map((t) => ({
        locale: t.locale,
        title: t.title,
        ...(t.excerpt ? { excerpt: t.excerpt } : {}),
        body: t.body,
        ...(t.metaTitle ? { metaTitle: t.metaTitle } : {}),
        ...(t.metaDescription ? { metaDescription: t.metaDescription } : {}),
        ...(t.ogImage ? { ogImage: t.ogImage } : {}),
        noIndex: t.noIndex,
      })),
    };

    try {
      const res = await fetch(
        mode === 'create' ? '/api/content' : `/api/content/${contentId}`,
        {
          method: mode === 'create' ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        const issue = data?.error?.issues?.[0];
        throw new Error(
          issue ? `${issue.path?.join('.') ?? ''}: ${issue.message}` : data?.error?.message ?? t('common.saveFailed')
        );
      }

      router.push(`${adminPath}/content/${labels.segment}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" data-test-id="page-form">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--admin-text)]">
          {mode === 'create' ? t(labels.newTitle) : t(labels.editTitle)}
        </h1>

        <div className="flex items-center gap-2">
          {mode === 'edit' && value.slug && (
            <Link
              href={`/ar/${value.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="admin-btn-ghost"
              data-test-id="page-preview"
            >
              <ExternalLink size={16} aria-hidden="true" />
              {t('form.preview')}
            </Link>
          )}
          <button
            type="submit"
            disabled={saving}
            className="admin-btn-primary disabled:opacity-50"
            data-test-id="page-save"
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <Save size={16} aria-hidden="true" />
            )}
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="admin-card border-[var(--admin-danger)] text-sm text-[var(--admin-danger)]">
          {error}
        </p>
      )}

      <div className="admin-card grid gap-4 sm:grid-cols-3">
        <label className="block sm:col-span-2">
          <span className="mb-2 block text-sm text-[var(--admin-text-secondary)]">{t('common.slugField')}</span>
          <input
            type="text"
            dir="ltr"
            required
            className="admin-input text-start"
            value={value.slug}
            onChange={(e) => setValue((p) => ({ ...p, slug: e.target.value }))}
            placeholder="about-us"
            data-test-id="page-slug"
          />
          <span className="mt-1 block text-xs text-[var(--admin-text-muted)]">
            {t('common.slugHint')}
          </span>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm text-[var(--admin-text-secondary)]">{t('common.status')}</span>
          <select
            className="admin-input"
            value={value.status}
            onChange={(e) =>
              setValue((p) => ({ ...p, status: e.target.value as PageFormValue['status'] }))
            }
            data-test-id="page-status"
          >
            <option value="draft">{t('status.draft')}</option>
            <option value="published">{t('status.published')}</option>
            <option value="archived">{t('status.archived')}</option>
          </select>
        </label>
      </div>

      {taxonomy && (taxonomy.hasCategories || taxonomy.hasTags) && (
        <div className="admin-card space-y-5">
          {taxonomy.hasCategories && (
            <TaxonomyPicker
              label={t('form.categories')}
              emptyHint={t('form.categoriesEmpty')}
              options={taxonomy.categories}
              selected={value.categoryIds}
              onChange={(categoryIds) => setValue((p) => ({ ...p, categoryIds }))}
              testId="picker-categories"
            />
          )}

          {taxonomy.hasTags && (
            <TaxonomyPicker
              label={t('form.tags')}
              emptyHint={t('form.tagsEmpty')}
              options={taxonomy.tags}
              selected={value.tagIds}
              onChange={(tagIds) => setValue((p) => ({ ...p, tagIds }))}
              testId="picker-tags"
            />
          )}

          <p className="text-xs text-[var(--admin-text-muted)]">
            {t('form.taxonomyHint')}
          </p>
        </div>
      )}

      {/* Locale tabs */}
      <div role="tablist" aria-label={t('form.languages')} className="flex gap-1 border-b border-[var(--admin-line)]">
        {LOCALES.map((locale) => {
          const filled = value.translations.some(
            (t) => t.locale === locale && t.title.trim().length > 0
          );
          return (
            <button
              key={locale}
              type="button"
              role="tab"
              aria-selected={activeLocale === locale}
              onClick={() => setActiveLocale(locale)}
              data-test-id={`locale-tab-${locale}`}
              className={cn(
                'flex items-center gap-2 border-b-2 px-4 py-2 text-sm transition-colors',
                activeLocale === locale
                  ? 'border-[var(--admin-primary)] text-[var(--admin-primary)]'
                  : 'border-transparent text-[var(--admin-text-secondary)] hover:text-[var(--admin-text)]'
              )}
            >
              {t(LOCALE_KEY[locale])}
              <span
                aria-label={filled ? t('form.filled') : t('form.blank')}
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  filled ? 'bg-[var(--admin-success)]' : 'bg-[var(--admin-text-muted)]'
                )}
              />
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="space-y-6">
        <div className="admin-card space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm text-[var(--admin-text-secondary)]">{t('form.title')}</span>
            <input
              type="text"
              className="admin-input"
              value={active.title}
              onChange={(e) => patchTranslation({ title: e.target.value })}
              data-test-id="page-title"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-[var(--admin-text-secondary)]">{t('form.excerpt')}</span>
            <textarea
              rows={2}
              className="admin-input resize-y"
              value={active.excerpt}
              onChange={(e) => patchTranslation({ excerpt: e.target.value })}
            />
          </label>
        </div>

        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[var(--admin-text)]">{t('form.sections')}</h2>
          {LOCALES.filter((l) => l !== activeLocale).map((other) => (
            <button
              key={other}
              type="button"
              onClick={() => copyStructureFrom(other)}
              className="admin-btn-ghost text-xs"
              data-test-id={`copy-structure-${other}`}
            >
              {t('form.copySections', { locale: t(LOCALE_KEY[other]) })}
            </button>
          ))}
        </div>

        {/* Remounted per locale so BlockBuilder's internal keys reset cleanly. */}
        <BlockBuilder
          key={activeLocale}
          blocks={active.body}
          onChange={(body) => patchTranslation({ body })}
        />

        <details className="admin-card">
          <summary className="cursor-pointer text-sm font-medium">{t('form.seo')}</summary>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm text-[var(--admin-text-secondary)]">{t('form.metaTitle')}</span>
              <input
                type="text"
                className="admin-input"
                value={active.metaTitle}
                onChange={(e) => patchTranslation({ metaTitle: e.target.value })}
                maxLength={255}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm text-[var(--admin-text-secondary)]">{t('form.metaDescription')}</span>
              <textarea
                rows={2}
                className="admin-input resize-y"
                value={active.metaDescription}
                onChange={(e) => patchTranslation({ metaDescription: e.target.value })}
                maxLength={500}
              />
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={active.noIndex}
                onChange={(e) => patchTranslation({ noIndex: e.target.checked })}
                data-test-id="page-noindex"
              />
              <span className="text-sm">{t('form.noindex')}</span>
            </label>
          </div>
        </details>
      </div>
    </form>
  );
}
