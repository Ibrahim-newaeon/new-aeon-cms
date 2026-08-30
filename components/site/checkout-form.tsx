// components/site/checkout-form.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { formatPrice } from '@/lib/money';
import type { ShippingRegion } from '@/lib/commerce/phone';

const COPY = {
  ar: {
    title: 'إتمام الطلب',
    name: 'الاسم الكامل',
    phone: 'رقم الهاتف',
    email: 'البريد الإلكتروني (اختياري)',
    governorate: 'المحافظة',
    choose: '— اختر —',
    city: 'المدينة / المنطقة',
    address: 'العنوان',
    landmark: 'أقرب معلم (اختياري)',
    notes: 'ملاحظات (اختياري)',
    coupon: 'كود الخصم',
    apply: 'تطبيق',
    subtotal: 'المجموع الفرعي',
    place: 'تأكيد الطلب — الدفع عند الاستلام',
    placing: 'جارٍ إرسال الطلب…',
    shippingNote: 'تُحتسب أجرة التوصيل بعد اختيار المحافظة عند تأكيد الطلب.',
    codNote: 'الدفع نقداً عند استلام الطلب.',
  },
  en: {
    title: 'Checkout',
    name: 'Full name',
    phone: 'Phone number',
    email: 'Email (optional)',
    governorate: 'Governorate',
    choose: '— Select —',
    city: 'City / area',
    address: 'Address',
    landmark: 'Nearest landmark (optional)',
    notes: 'Notes (optional)',
    coupon: 'Discount code',
    apply: 'Apply',
    subtotal: 'Subtotal',
    place: 'Place order — cash on delivery',
    placing: 'Placing your order…',
    shippingNote: 'Delivery is calculated from your governorate when you confirm.',
    codNote: 'Payment is in cash when your order arrives.',
  },
} as const;

export function CheckoutForm({
  locale,
  currency,
  subtotal,
  token,
  regions,
}: {
  locale: 'ar' | 'en';
  currency: string;
  subtotal: number;
  /** One-time, minted server-side. Makes a double submit idempotent. */
  token: string;
  /**
   * Where this store ships. Passed in rather than imported, so this dropdown
   * and the shipping-zone editor cannot offer different values — a zone built
   * on a region the form never shows matches nothing, and every order in it
   * falls through to "no zone" at checkout.
   */
  regions: readonly ShippingRegion[];
}) {
  const router = useRouter();
  const copy = COPY[locale];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<string[]>([]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setUnavailable([]);

    const form = new FormData(e.currentTarget);

    try {
      // Only what the customer chose and typed. No price, subtotal or total —
      // the server computes every figure from the database.
      const res = await fetch('/api/commerce/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          name: form.get('name'),
          phone: form.get('phone'),
          email: form.get('email') || undefined,
          governorate: form.get('governorate'),
          city: form.get('city'),
          addressLine: form.get('addressLine'),
          landmark: form.get('landmark') || undefined,
          notes: form.get('notes') || undefined,
          couponCode: form.get('couponCode') || undefined,
          locale,
          token,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        if (Array.isArray(data?.error?.items)) setUnavailable(data.error.items);
        throw new Error(data?.error?.message ?? 'تعذّر إتمام الطلب.');
      }

      router.push(`/${locale}/order/${data.data.orderNumber}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر إتمام الطلب.');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} method="post" className="grid gap-8 lg:grid-cols-3" data-test-id="checkout-form">
      <div className="space-y-4 lg:col-span-2">
        <Field label={copy.name}>
          <input name="name" required minLength={2} className="w-full rounded-lg border border-site-line p-3 text-sm" data-test-id="checkout-name" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={copy.phone}>
            <input name="phone" required type="tel" dir="ltr" placeholder="07XXXXXXXX"
              className="w-full rounded-lg border border-site-line p-3 text-start text-sm" data-test-id="checkout-phone" />
          </Field>
          <Field label={copy.email}>
            <input name="email" type="email" dir="ltr"
              className="w-full rounded-lg border border-site-line p-3 text-start text-sm" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={copy.governorate}>
            <select name="governorate" required className="w-full rounded-lg border border-site-line p-3 text-sm" data-test-id="checkout-governorate">
              <option value="">{copy.choose}</option>
              {regions.map((g) => (
                <option key={g.value} value={g.value}>{locale === 'ar' ? g.ar : g.en}</option>
              ))}
            </select>
          </Field>
          <Field label={copy.city}>
            <input name="city" required minLength={2} className="w-full rounded-lg border border-site-line p-3 text-sm" data-test-id="checkout-city" />
          </Field>
        </div>

        <Field label={copy.address}>
          <input name="addressLine" required minLength={5} className="w-full rounded-lg border border-site-line p-3 text-sm" data-test-id="checkout-address" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={copy.landmark}>
            <input name="landmark" className="w-full rounded-lg border border-site-line p-3 text-sm" />
          </Field>
          <Field label={copy.notes}>
            <input name="notes" className="w-full rounded-lg border border-site-line p-3 text-sm" />
          </Field>
        </div>
      </div>

      <aside className="h-fit space-y-4 rounded-lg border border-site-line p-5">
        <Field label={copy.coupon}>
          <input name="couponCode" dir="ltr" placeholder="CODE"
            className="w-full rounded-lg border border-site-line p-3 text-start text-sm uppercase" data-test-id="checkout-coupon" />
        </Field>

        <div className="flex justify-between border-t border-site-line pt-4 text-sm">
          <span className="text-site-ink-muted">{copy.subtotal}</span>
          <span className="font-semibold text-site-ink" dir="ltr">
            {formatPrice(subtotal, currency, locale)}
          </span>
        </div>
        <p className="text-xs text-site-ink-muted">{copy.shippingNote}</p>
        <p className="text-xs text-site-ink-muted">{copy.codNote}</p>

        {unavailable.length > 0 && (
          <ul role="alert" className="space-y-1 text-sm text-site-danger">
            {unavailable.map((item) => <li key={item}>{item}</li>)}
          </ul>
        )}
        {error && <p role="alert" className="text-sm text-site-danger">{error}</p>}

        <button type="submit" disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-site-accent px-6 py-3 text-sm font-medium text-site-accent-ink hover:bg-site-accent-hover disabled:opacity-50"
          data-test-id="checkout-submit">
          {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          {saving ? copy.placing : copy.place}
        </button>
      </aside>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-site-ink-muted">{label}</span>
      {children}
    </label>
  );
}
