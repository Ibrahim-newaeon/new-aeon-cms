'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Search, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { formatPrice } from '@/lib/money';
import {
  ORDER_STATUSES,
  STATUS_LABEL,
  STATUS_TONE,
  PAYMENT_LABEL,
  PAYMENT_TONE,
  type OrderStatus,
  type PaymentStatus,
} from '@/lib/commerce/order-status';

export interface OrderRow {
  id: string;
  orderNumber: string;
  customerName: string;
  phone: string;
  governorate: string;
  total: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  itemCount: number;
  createdAt: string | null;
}

interface Props {
  rows: OrderRow[];
  basePath: string;
  currency: string;
  total: number;
  page: number;
  pageCount: number;
  status: OrderStatus | '';
  search: string;
}

/**
 * Filters live in the URL, not in component state.
 *
 * Unlike the other admin tables this one does NOT filter in memory — orders
 * grow without limit, so the server does the work and this component only
 * drives the query string. Putting it in the URL also means a filtered view is
 * shareable and survives a refresh, which matters when two people are working
 * the same queue.
 */
export function OrdersTable({
  rows, basePath, currency, total, page, pageCount, status, search,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(search);

  function navigate(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());

    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }

    // Any change to the filters invalidates the current page number.
    if (!('page' in changes)) next.delete('page');

    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ q: query });
          }}
          className="relative flex-1 min-w-[240px]"
        >
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-[var(--admin-text-muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث برقم الطلب أو الاسم أو الهاتف"
            className="w-full rounded-lg border border-[var(--admin-line)] bg-[var(--admin-bg)] py-2 ps-9 pe-3 text-sm text-[var(--admin-text)] placeholder:text-[var(--admin-text-muted)]"
          />
        </form>

        <select
          value={status}
          onChange={(e) => navigate({ status: e.target.value })}
          className="rounded-lg border border-[var(--admin-line)] bg-[var(--admin-bg)] px-3 py-2 text-sm text-[var(--admin-text)]"
        >
          <option value="">كل الحالات</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s].ar}</option>
          ))}
        </select>

        <span className="text-sm text-[var(--admin-text-muted)]">
          {total} طلب
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--admin-line)] bg-[var(--admin-surface)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--admin-line)] text-start text-xs text-[var(--admin-text-muted)]">
              <th className="px-4 py-3 text-start font-medium">رقم الطلب</th>
              <th className="px-4 py-3 text-start font-medium">العميل</th>
              <th className="px-4 py-3 text-start font-medium">المحافظة</th>
              <th className="px-4 py-3 text-start font-medium">القطع</th>
              <th className="px-4 py-3 text-start font-medium">الإجمالي</th>
              <th className="px-4 py-3 text-start font-medium">الحالة</th>
              <th className="px-4 py-3 text-start font-medium">الدفع</th>
              <th className="px-4 py-3 text-start font-medium">التاريخ</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className={pending ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-[var(--admin-text-muted)]">
                  لا توجد طلبات مطابقة.
                </td>
              </tr>
            )}

            {rows.map((row) => (
              <tr key={row.id} className="border-b border-[var(--admin-line)] last:border-0 hover:bg-[var(--admin-elevated)]">
                <td className="px-4 py-3">
                  <Link href={`${basePath}/${row.id}`} className="font-medium text-[var(--admin-accent)]" dir="ltr">
                    {row.orderNumber}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <div className="text-[var(--admin-text)]">{row.customerName}</div>
                  {/* dir=ltr: a digit-only phone inside an RTL cell otherwise reorders. */}
                  <div className="text-xs text-[var(--admin-text-muted)]" dir="ltr">{row.phone}</div>
                </td>
                <td className="px-4 py-3 text-[var(--admin-text-secondary)]">{row.governorate}</td>
                <td className="px-4 py-3 text-[var(--admin-text-secondary)]" dir="ltr">{row.itemCount}</td>
                <td className="px-4 py-3 text-[var(--admin-text)]" dir="ltr">
                  {formatPrice(row.total, currency, 'ar')}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs ${STATUS_TONE[row.status]}`}>
                    {STATUS_LABEL[row.status].ar}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs ${PAYMENT_TONE[row.paymentStatus]}`}>
                    {PAYMENT_LABEL[row.paymentStatus].ar}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-[var(--admin-text-muted)]" dir="ltr">
                  {row.createdAt ? new Date(row.createdAt).toLocaleDateString('en-GB') : '—'}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`${basePath}/${row.id}`}
                    className="inline-flex items-center gap-1 text-xs text-[var(--admin-text-muted)] hover:text-[var(--admin-text)]"
                  >
                    <Eye className="h-4 w-4" /> عرض
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => navigate({ page: String(page - 1) })}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--admin-line)] px-3 py-1.5 text-[var(--admin-text-secondary)] disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" /> السابق
          </button>

          <span className="text-[var(--admin-text-muted)]" dir="ltr">
            {page} / {pageCount}
          </span>

          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => navigate({ page: String(page + 1) })}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--admin-line)] px-3 py-1.5 text-[var(--admin-text-secondary)] disabled:opacity-40"
          >
            التالي <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
