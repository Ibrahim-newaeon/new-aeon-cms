// components/admin/product-form.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MediaField } from './media-field';
import { toMajorUnits, toMinorUnits, minorUnitExponent } from '@/lib/money';
// Types and the factory live in a non-client module so the server pages can
// import them without crossing the client boundary.
import {
  emptyProductTranslation,
  type ProductFormValue,
  type ProductTranslationDraft,
  type VariantDraft,
} from '@/lib/commerce/product-draft';
import { useT } from './i18n-provider';
import type { MessageKey } from '@/lib/admin-i18n';

export type { ProductFormValue, ProductTranslationDraft, VariantDraft };

const LOCALES: ReadonlyArray<'ar' | 'en'> = ['ar', 'en'];
const LOCALE_KEY: Record<'ar' | 'en', MessageKey> = { ar: 'form.localeAr', en: 'form.localeEn' };

interface Props {
  mode: 'create' | 'edit';
  productId?: string;
  initial: ProductFormValue;
  adminPath: string;
  currency: string;
  brands: { id: string; label: string }[];
  categories: { id: string; label: string }[];
}

export function ProductForm({
  mode, productId, initial, adminPath, currency, brands, categories,
}: Props) {
  const t = useT();
  const router = useRouter();
  const [value, setValue] = useState<ProductFormValue>(initial);
  const [locale, setLocale] = useState<'ar' | 'en'>('ar');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exponent = minorUnitExponent(currency);
  const step = (1 / 10 ** exponent).toFixed(exponent);

  const active =
    value.translations.find((t) => t.locale === locale) ?? emptyProductTranslation(locale);

  const patchTranslation = (patch: Partial<ProductTranslationDraft>) =>
    setValue((prev) => {
      const exists = prev.translations.some((t) => t.locale === locale);
      return {
        ...prev,
        translations: exists
          ? prev.translations.map((t) => (t.locale === locale ? { ...t, ...patch } : t))
          : [...prev.translations, { ...emptyProductTranslation(locale), ...patch }],
      };
    });

  /** Renaming an option must carry its values across, or every variant loses them. */
  const renameOption = (index: number, name: string) => {
    setValue((prev) => {
      const old = prev.options[index]?.name;
      if (old === undefined) return prev;
      return {
        ...prev,
        options: prev.options.map((o, i) => (i === index ? { ...o, name } : o)),
        variants: prev.variants.map((v) => {
          const { [old]: carried, ...rest } = v.optionValues;
          return { ...v, optionValues: { ...rest, [name]: carried ?? '' } };
        }),
      };
    });
  };

  const removeOption = (index: number) =>
    setValue((prev) => {
      const removed = prev.options[index]?.name;
      return {
        ...prev,
        options: prev.options.filter((_, i) => i !== index),
        variants: prev.variants.map((v) => {
          if (removed === undefined) return v;
          const { [removed]: _drop, ...rest } = v.optionValues;
          return { ...v, optionValues: rest };
        }),
      };
    });

  const addVariant = () =>
    setValue((prev) => ({
      ...prev,
      variants: [
        ...prev.variants,
        {
          sku: '',
          price: prev.basePrice,
          stock: 0,
          isActive: true,
          // Seed a key per declared option so the payload always covers every axis.
          optionValues: Object.fromEntries(prev.options.map((o) => [o.name, ''])),
        },
      ],
    }));

  const patchVariant = (index: number, patch: Partial<VariantDraft>) =>
    setValue((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) => (i === index ? { ...v, ...patch } : v)),
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const translations = value.translations.filter((t) => t.name.trim().length > 0);
    if (translations.length === 0) {
      setError(t('product.nameRequired'));
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(
        mode === 'create' ? '/api/commerce/products' : `/api/commerce/products/${productId}`,
        {
          method: mode === 'create' ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            ...value,
            compareAtPrice: value.compareAtPrice ?? undefined,
            translations: translations.map((t) => ({
              locale: t.locale,
              name: t.name,
              ...(t.shortDesc ? { shortDesc: t.shortDesc } : {}),
              ...(t.description ? { description: t.description } : {}),
              ...(t.metaTitle ? { metaTitle: t.metaTitle } : {}),
              ...(t.metaDescription ? { metaDescription: t.metaDescription } : {}),
            })),
            images: value.images.filter((i) => i.url.trim().length > 0),
            specs: value.specs.filter((s) => s.key.trim() && s.value.trim()),
          }),
        }
      );

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        const issue = data?.error?.issues?.[0];
        throw new Error(
          issue ? `${issue.path?.join('.') ?? ''}: ${issue.message}` : data?.error?.message ?? t('common.saveFailed')
        );
      }

      router.push(`${adminPath}/commerce/products`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} method="post" className="space-y-6" data-test-id="product-form">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--admin-text)]">
          {mode === 'create' ? t('product.new') : t('product.edit')}
        </h1>
        <button type="submit" disabled={saving} className="admin-btn disabled:opacity-50" data-test-id="product-save">
          {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>

      {error && (
        <p role="alert" className="admin-card border-[var(--admin-danger)] text-sm text-[var(--admin-danger)]">
          {error}
        </p>
      )}

      {/* Details */}
      <div className="admin-card grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t('common.slugField')}>
          <input type="text" dir="ltr" required className="admin-input text-start"
            value={value.slug} onChange={(e) => setValue((p) => ({ ...p, slug: e.target.value }))}
            placeholder="product-slug" data-test-id="product-slug" />
        </Field>

        <Field label={t('product.price', { currency })}>
          <input type="number" dir="ltr" step={step} min={0} required className="admin-input text-start"
            value={toMajorUnits(value.basePrice, currency)}
            onChange={(e) => setValue((p) => ({ ...p, basePrice: toMinorUnits(Number(e.target.value) || 0, currency) }))}
            data-test-id="product-price" />
        </Field>

        <Field label={t('product.compareAt')}>
          <input type="number" dir="ltr" step={step} min={0} className="admin-input text-start"
            value={value.compareAtPrice === null ? '' : toMajorUnits(value.compareAtPrice, currency)}
            onChange={(e) => setValue((p) => ({
              ...p,
              compareAtPrice: e.target.value === '' ? null : toMinorUnits(Number(e.target.value) || 0, currency),
            }))} />
        </Field>

        <Field label={t('product.brand')}>
          <select className="admin-input" value={value.brandId ?? ''}
            onChange={(e) => setValue((p) => ({ ...p, brandId: e.target.value || null }))} data-test-id="product-brand">
            <option value="">{t('common.none')}</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </Field>

        {/* Several categories per product, and ORDER carries meaning: the first
            ticked is the primary one, which owns the breadcrumb and the
            canonical /shop/[category] URL. A single select could not express
            "this is a perfume, and a gift, and for women" — which is what the
            imported catalogue actually said. */}
        <Field label={t('product.categories')}>
          <div
            className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border border-[var(--admin-line)] p-2"
            role="group"
            aria-label={t('product.categories')}
            data-test-id="product-categories"
          >
            {categories.length === 0 && (
              <span className="px-1 py-2 text-sm text-[var(--admin-text-secondary)]">
                {t('common.none')}
              </span>
            )}
            {categories.map((c) => {
              const at = value.categoryIds.indexOf(c.id);
              const checked = at !== -1;
              return (
                <label key={c.id} className="flex items-center gap-2 px-1 py-0.5 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    data-test-id={`product-category-${c.id}`}
                    onChange={(e) =>
                      setValue((p) => ({
                        ...p,
                        // Append on tick so the first one ticked stays first.
                        categoryIds: e.target.checked
                          ? [...p.categoryIds, c.id]
                          : p.categoryIds.filter((id) => id !== c.id),
                      }))
                    }
                  />
                  <span>{c.label}</span>
                  {at === 0 && (
                    <span className="rounded bg-[var(--admin-accent)]/15 px-1.5 py-0.5 text-[11px] text-[var(--admin-accent)]">
                      {t('product.primaryCategory')}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </Field>

        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" checked={value.isActive}
            onChange={(e) => setValue((p) => ({ ...p, isActive: e.target.checked }))} data-test-id="product-active" />
          {t('product.visibleInShop')}
        </label>
      </div>

      {/* Locale tabs */}
      <div role="tablist" aria-label={t('form.languages')} className="flex gap-1 border-b border-[var(--admin-line)]">
        {LOCALES.map((l) => {
          const filled = value.translations.some((t) => t.locale === l && t.name.trim());
          return (
            <button key={l} type="button" role="tab" aria-selected={locale === l}
              onClick={() => setLocale(l)} data-test-id={`product-locale-${l}`}
              className={cn('flex items-center gap-2 border-b-2 px-4 py-2 text-sm transition-colors',
                locale === l
                  ? 'border-[var(--admin-accent)] text-[var(--admin-accent-soft)]'
                  : 'border-transparent text-[var(--admin-text-secondary)] hover:text-[var(--admin-text)]')}>
              {t(LOCALE_KEY[l])}
              <span className={cn('h-1.5 w-1.5 rounded-full', filled ? 'bg-[var(--admin-success)]' : 'bg-[var(--admin-text-muted)]')} />
            </button>
          );
        })}
      </div>

      <div className="admin-card space-y-4">
        <Field label={t('product.name')}>
          <input type="text" className="admin-input" value={active.name}
            onChange={(e) => patchTranslation({ name: e.target.value })} data-test-id="product-name" />
        </Field>
        <Field label={t('product.shortDescription')}>
          <input type="text" className="admin-input" value={active.shortDesc}
            onChange={(e) => patchTranslation({ shortDesc: e.target.value })} />
        </Field>
        <Field label={t('product.description')}>
          <textarea rows={5} className="admin-input resize-y" value={active.description}
            onChange={(e) => patchTranslation({ description: e.target.value })} />
        </Field>
      </div>

      {/* Images */}
      <div className="admin-card space-y-3">
        <h2 className="font-medium">{t('product.images')}</h2>
        {value.images.map((img, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="flex-1">
              <MediaField label={t('product.imageN', { n: i + 1 })} value={img.url} testId={`product-image-${i}`}
                onChange={(url) => setValue((p) => ({ ...p, images: p.images.map((x, j) => (j === i ? { ...x, url } : x)) }))} />
            </div>
            <input type="text" placeholder={t('product.altText')} className="admin-input mb-1 flex-1" value={img.alt}
              onChange={(e) => setValue((p) => ({ ...p, images: p.images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)) }))} />
            <button type="button" aria-label={t('product.deleteImage', { n: i + 1 })} className="mb-1 rounded p-2 text-[var(--admin-danger)] hover:bg-red-500/10"
              onClick={() => setValue((p) => ({ ...p, images: p.images.filter((_, j) => j !== i) }))}>
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setValue((p) => ({ ...p, images: [...p.images, { url: '', alt: '' }] }))}
          className="admin-btn-ghost w-full justify-center border border-dashed border-[var(--admin-line)]" data-test-id="product-add-image">
          <Plus size={14} aria-hidden="true" /> {t('product.addImage')}
        </button>
      </div>

      {/* Options & variants */}
      <div className="admin-card space-y-4">
        <div>
          <h2 className="font-medium">{t('product.optionsTitle')}</h2>
          <p className="mt-1 text-xs text-[var(--admin-text-muted)]">
            {t('product.optionsHint')}
          </p>
        </div>

        <div className="space-y-2">
          {value.options.map((option, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="text" placeholder={t('product.optionName')} className="admin-input" value={option.name}
                onChange={(e) => renameOption(i, e.target.value)} data-test-id={`product-option-${i}`} />
              <button type="button" aria-label={t('product.deleteOption', { n: i + 1 })} onClick={() => removeOption(i)}
                className="rounded p-2 text-[var(--admin-danger)] hover:bg-red-500/10">
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
          {value.options.length < 4 && (
            <button type="button" data-test-id="product-add-option"
              onClick={() => setValue((p) => ({ ...p, options: [...p.options, { name: '', position: p.options.length }] }))}
              className="admin-btn-ghost w-full justify-center border border-dashed border-[var(--admin-line)]">
              <Plus size={14} aria-hidden="true" /> {t('product.addOption')}
            </button>
          )}
        </div>

        {value.variants.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--admin-line)] text-start text-xs text-[var(--admin-text-muted)]">
                  {value.options.map((o, i) => <th key={i} className="p-2 text-start">{o.name || t('product.optionN', { n: i + 1 })}</th>)}
                  <th className="p-2 text-start">SKU</th>
                  <th className="p-2 text-start">{t('products.colPrice')}</th>
                  <th className="p-2 text-start">{t('product.colStock')}</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {value.variants.map((variant, i) => (
                  <tr key={i} className="border-b border-[var(--admin-line)] last:border-0" data-test-id={`product-variant-${i}`}>
                    {value.options.map((o, j) => (
                      <td key={j} className="p-1">
                        <input type="text" className="admin-input py-1.5 text-xs" value={variant.optionValues[o.name] ?? ''}
                          aria-label={t('product.optionForVariant', { option: o.name, n: i + 1 })}
                          onChange={(e) => patchVariant(i, { optionValues: { ...variant.optionValues, [o.name]: e.target.value } })} />
                      </td>
                    ))}
                    <td className="p-1">
                      <input type="text" dir="ltr" className="admin-input py-1.5 text-xs text-start" value={variant.sku}
                        aria-label={t('product.skuForVariant', { n: i + 1 })} onChange={(e) => patchVariant(i, { sku: e.target.value })} />
                    </td>
                    <td className="p-1">
                      <input type="number" dir="ltr" step={step} min={0} className="admin-input py-1.5 text-xs text-start"
                        aria-label={t('product.priceForVariant', { n: i + 1 })} value={toMajorUnits(variant.price, currency)}
                        onChange={(e) => patchVariant(i, { price: toMinorUnits(Number(e.target.value) || 0, currency) })} />
                    </td>
                    <td className="p-1">
                      <input type="number" dir="ltr" min={0} className="admin-input py-1.5 text-xs text-start"
                        aria-label={t('product.stockForVariant', { n: i + 1 })} value={variant.stock}
                        onChange={(e) => patchVariant(i, { stock: Number(e.target.value) || 0 })} />
                    </td>
                    <td className="p-1">
                      <button type="button" aria-label={t('product.deleteVariant', { n: i + 1 })}
                        onClick={() => setValue((p) => ({ ...p, variants: p.variants.filter((_, j) => j !== i) }))}
                        className="rounded p-1.5 text-[var(--admin-danger)] hover:bg-red-500/10">
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button type="button" onClick={addVariant} disabled={value.options.length === 0}
          className="admin-btn-ghost w-full justify-center border border-dashed border-[var(--admin-line)] disabled:opacity-40"
          data-test-id="product-add-variant">
          <Plus size={14} aria-hidden="true" />
          {value.options.length === 0 ? t('product.addOptionFirst') : t('product.addVariant')}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">{label}</span>
      {children}
    </label>
  );
}
