'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Star, Plus, Loader2 } from 'lucide-react';
import type { ShippingRegion } from '@/lib/commerce/phone';

export interface AddressRow {
  id: string;
  label: string | null;
  name: string;
  phone: string;
  governorate: string;
  city: string;
  addressLine: string;
  landmark: string | null;
  isDefault: boolean;
}

const COPY = {
  ar: {
    add: 'أضف عنواناً', label: 'التسمية (المنزل، العمل…)', name: 'الاسم', phone: 'الهاتف',
    governorate: 'المحافظة', city: 'المدينة', address: 'العنوان', landmark: 'علامة مميزة',
    save: 'حفظ', cancel: 'إلغاء', makeDefault: 'اجعله الافتراضي', isDefault: 'الافتراضي',
    remove: 'حذف', none: 'لا عناوين محفوظة بعد.', choose: 'اختر', failed: 'تعذّر الحفظ.',
  },
  en: {
    add: 'Add an address', label: 'Label (Home, Work…)', name: 'Name', phone: 'Phone',
    governorate: 'Governorate', city: 'City', address: 'Address', landmark: 'Landmark',
    save: 'Save', cancel: 'Cancel', makeDefault: 'Make default', isDefault: 'Default',
    remove: 'Remove', none: 'No saved addresses yet.', choose: 'Choose', failed: 'Could not save.',
  },
} as const;

/**
 * The address book.
 *
 * Exactly one address is the default, and checkout prefills from it — which is
 * the whole point: a returning buyer should not retype where they live on
 * every order.
 */
export function AddressBook({
  locale,
  initial,
  regions,
}: {
  locale: 'ar' | 'en';
  initial: AddressRow[];
  regions: readonly ShippingRegion[];
}) {
  const c = COPY[locale];
  const router = useRouter();
  const [adding, setAdding] = useState(initial.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const field = 'w-full rounded-lg border border-site-line px-3 py-2.5 text-sm';

  const submit = async (form: HTMLFormElement) => {
    setBusy(true);
    setError(null);
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      const res = await fetch('/api/account/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ...data, isDefault: data.isDefault === 'on' }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.error?.message ?? c.failed);
        return;
      }
      form.reset();
      setAdding(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const act = (method: 'PATCH' | 'DELETE', id: string) =>
    start(async () => {
      await fetch('/api/account/addresses', {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id }),
      });
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4" data-test-id="address-book">
      {initial.length === 0 && !adding && (
        <p className="text-sm text-site-ink-muted">{c.none}</p>
      )}

      {initial.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {initial.map((a) => (
            <li key={a.id} className="rounded-lg border border-site-line p-4" data-test-id="address-row">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-site-ink">
                  {a.label || a.name}
                  {a.isDefault && (
                    <span className="ms-2 rounded-full bg-site-accent/12 px-2 py-0.5 text-xs text-site-ink" data-test-id="address-default">
                      {c.isDefault}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 gap-1">
                  {!a.isDefault && (
                    <button type="button" aria-label={c.makeDefault} onClick={() => act('PATCH', a.id)}
                      className="rounded p-1 text-site-ink-muted hover:text-site-ink" data-test-id="address-make-default">
                      <Star size={14} aria-hidden="true" />
                    </button>
                  )}
                  <button type="button" aria-label={c.remove} onClick={() => act('DELETE', a.id)}
                    className="rounded p-1 text-site-ink-muted hover:text-site-danger" data-test-id="address-delete">
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </span>
              </div>
              <p className="mt-2 text-sm text-site-ink-muted">
                {a.name} · {a.city}
                <br />
                {a.addressLine}
                {a.landmark ? <><br />{a.landmark}</> : null}
              </p>
              <p className="mt-1 font-mono text-xs text-site-ink-muted" dir="ltr">{a.phone}</p>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form
          className="flex flex-col gap-3 rounded-lg border border-site-line p-4"
          onSubmit={(e) => { e.preventDefault(); void submit(e.currentTarget); }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">{c.label}
              <input name="label" className={field} data-test-id="address-label" /></label>
            <label className="flex flex-col gap-1 text-sm">{c.name}
              <input name="name" required minLength={2} className={field} data-test-id="address-name" /></label>
            <label className="flex flex-col gap-1 text-sm">{c.phone}
              <input name="phone" type="tel" dir="ltr" required className={field} data-test-id="address-phone" /></label>
            <label className="flex flex-col gap-1 text-sm">{c.governorate}
              <select name="governorate" required className={field} data-test-id="address-governorate">
                <option value="">{c.choose}</option>
                {regions.map((r) => (
                  <option key={r.value} value={r.value}>{locale === 'ar' ? r.ar : r.en}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">{c.city}
              <input name="city" required minLength={2} className={field} data-test-id="address-city" /></label>
            <label className="flex flex-col gap-1 text-sm">{c.landmark}
              <input name="landmark" className={field} /></label>
          </div>
          <label className="flex flex-col gap-1 text-sm">{c.address}
            <input name="addressLine" required minLength={5} className={field} data-test-id="address-line" /></label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isDefault" data-test-id="address-is-default" />
            {c.makeDefault}
          </label>
          {error && <p className="text-sm text-site-danger" data-test-id="address-error">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="site-btn-primary" data-test-id="address-save">
              {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {c.save}
            </button>
            {initial.length > 0 && (
              <button type="button" onClick={() => setAdding(false)} className="site-btn-outline">{c.cancel}</button>
            )}
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="site-btn-outline self-start" data-test-id="address-add">
          <Plus size={16} aria-hidden="true" />
          {c.add}
        </button>
      )}
    </div>
  );
}
