'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { formatPrice } from '@/lib/money';
import {
  nextStatuses,
  restoresStock,
  notifiesCustomer,
  STATUS_LABEL,
  STATUS_TONE,
  PAYMENT_LABEL,
  PAYMENT_TONE,
  PAYMENT_STATUSES,
  type OrderStatus,
  type PaymentStatus,
} from '@/lib/commerce/order-status';

export interface OrderDetailData {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string;
  customerName: string;
  phone: string;
  email: string | null;
  governorate: string;
  city: string;
  addressLine: string;
  landmark: string | null;
  notes: string | null;
  couponCode: string | null;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  createdAt: string | null;
  items: { id: string; nameSnapshot: string; skuSnapshot: string; priceSnapshot: number; qty: number }[];
  history: { id: string; fromStatus: string | null; toStatus: string; note: string | null; createdAt: string | null }[];
}

export function OrderDetail({
  order, basePath, currency,
}: {
  order: OrderDetailData;
  basePath: string;
  currency: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const money = (n: number) => formatPrice(n, currency, 'ar');
  const allowed = nextStatuses(order.status);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(`/api/commerce/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json?.error?.message ?? 'تعذّر تحديث الطلب');
        return;
      }

      setNote('');
      router.refresh();
    } catch {
      setError('تعذّر الاتصال بالخادم');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={basePath}
            className="mb-2 inline-flex items-center gap-1 text-xs text-[var(--admin-text-muted)] hover:text-[var(--admin-text)]"
          >
            <ArrowRight className="h-4 w-4" /> كل الطلبات
          </Link>
          <h1 className="text-2xl font-bold text-[var(--admin-text)]" dir="ltr">{order.orderNumber}</h1>
        </div>

        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs ${STATUS_TONE[order.status]}`}>
            {STATUS_LABEL[order.status].ar}
          </span>
          <span className={`rounded-full px-3 py-1 text-xs ${PAYMENT_TONE[order.paymentStatus]}`}>
            {PAYMENT_LABEL[order.paymentStatus].ar}
          </span>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="المنتجات">
            <table className="w-full text-sm">
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--admin-line)] last:border-0">
                    <td className="py-3">
                      <div className="text-[var(--admin-text)]">{item.nameSnapshot}</div>
                      <div className="text-xs text-[var(--admin-text-muted)]" dir="ltr">{item.skuSnapshot}</div>
                    </td>
                    <td className="py-3 text-center text-[var(--admin-text-secondary)]" dir="ltr">×{item.qty}</td>
                    <td className="py-3 text-end text-[var(--admin-text)]" dir="ltr">
                      {money(item.priceSnapshot * item.qty)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 space-y-2 border-t border-[var(--admin-line)] pt-4 text-sm">
              <Row label="المجموع الفرعي" value={money(order.subtotal)} />
              {order.discount > 0 && (
                <Row
                  label={order.couponCode ? `الخصم (${order.couponCode})` : 'الخصم'}
                  value={`- ${money(order.discount)}`}
                />
              )}
              <Row label="التوصيل" value={money(order.shipping)} />
              <Row label="الإجمالي" value={money(order.total)} strong />
            </div>
          </Card>

          <Card title="سجل الحالات">
            <ol className="space-y-3 text-sm">
              {order.history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-[var(--admin-text-muted)] text-xs" dir="ltr">
                    {h.createdAt ? new Date(h.createdAt).toLocaleString('en-GB') : '—'}
                  </span>
                  <span className="text-[var(--admin-text-secondary)]">
                    {h.fromStatus
                      ? `${STATUS_LABEL[h.fromStatus as OrderStatus].ar} ← ${STATUS_LABEL[h.toStatus as OrderStatus].ar}`
                      : STATUS_LABEL[h.toStatus as OrderStatus].ar}
                  </span>
                  {h.note && <span className="text-xs text-[var(--admin-text-muted)]">— {h.note}</span>}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="العميل">
            <dl className="space-y-2 text-sm">
              <Row label="الاسم" value={order.customerName} />
              <Row label="الهاتف" value={order.phone} ltr />
              <Row label="البريد" value={order.email || '—'} ltr />
              <Row label="المحافظة" value={order.governorate} />
              <Row label="المدينة" value={order.city} />
              <Row label="العنوان" value={order.addressLine} />
              {order.landmark && <Row label="أقرب معلم" value={order.landmark} />}
              {order.notes && <Row label="ملاحظات العميل" value={order.notes} />}
            </dl>
          </Card>

          <Card title="تغيير الحالة">
            {allowed.length === 0 ? (
              <p className="text-sm text-[var(--admin-text-muted)]">
                هذه حالة نهائية ولا يمكن تغييرها.
              </p>
            ) : (
              <div className="space-y-3">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="ملاحظة تُحفظ في السجل (اختياري)"
                  rows={2}
                  className="w-full rounded-lg border border-[var(--admin-line)] bg-[var(--admin-bg)] px-3 py-2 text-sm text-[var(--admin-text)] placeholder:text-[var(--admin-text-muted)]"
                />

                <div className="flex flex-wrap gap-2">
                  {allowed.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={busy}
                      onClick={() => patch({ action: 'status', status: s, note: note || undefined })}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--admin-line)] bg-[var(--admin-elevated)] px-3 py-2 text-sm text-[var(--admin-text)] hover:border-[var(--admin-accent)] disabled:opacity-50"
                    >
                      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {STATUS_LABEL[s].ar}
                    </button>
                  ))}
                </div>

                {/* Both consequences are stated before the click, not after. */}
                {allowed.some(restoresStock) && (
                  <p className="text-xs text-[var(--admin-text-muted)]">
                    الإلغاء أو الاسترجاع يعيد الكميات إلى المخزون تلقائياً.
                  </p>
                )}
                {order.email && allowed.some(notifiesCustomer) && (
                  <p className="text-xs text-[var(--admin-text-muted)]">
                    سيصل العميل بريد بالتحديث على <span dir="ltr">{order.email}</span>.
                  </p>
                )}
              </div>
            )}
          </Card>

          <Card title="حالة الدفع">
            <p className="mb-3 text-xs text-[var(--admin-text-muted)]">
              مستقلة عن حالة الطلب — طلب مُوصَّل قد يبقى غير مُحصَّل حتى يسلّم المندوب المبلغ.
            </p>
            <select
              value={order.paymentStatus}
              disabled={busy}
              onChange={(e) => patch({ action: 'payment', paymentStatus: e.target.value })}
              className="w-full rounded-lg border border-[var(--admin-line)] bg-[var(--admin-bg)] px-3 py-2 text-sm text-[var(--admin-text)] disabled:opacity-50"
            >
              {PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>{PAYMENT_LABEL[s].ar}</option>
              ))}
            </select>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-surface)] p-5">
      <h2 className="mb-4 text-sm font-semibold text-[var(--admin-text)]">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value, ltr, strong }: { label: string; value: string; ltr?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-[var(--admin-text-muted)]">{label}</span>
      <span
        className={`text-sm ${strong ? 'font-bold text-[var(--admin-text)]' : 'text-[var(--admin-text-secondary)]'}`}
        dir={ltr ? 'ltr' : undefined}
      >
        {value}
      </span>
    </div>
  );
}
