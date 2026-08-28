// app/(admin)/admin/commerce/orders/page.tsx
import { db } from '@/lib/db';
import { orderItems } from '@/lib/db/schema';
import { inArray, sql } from 'drizzle-orm';
import { getSettings } from '@/lib/db/queries';
import { listOrders } from '@/lib/commerce/orders';
import { isOrderStatus } from '@/lib/commerce/order-status';
import { OrdersTable, type OrderRow } from '@/components/admin/orders-table';
import { createTranslator } from '@/lib/admin-i18n';
import { getAdminLocale } from '@/lib/admin-i18n/server';

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';

export const dynamic = 'force-dynamic';

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const t = createTranslator(await getAdminLocale());
  const params = await searchParams;

  // An unknown ?status= is dropped rather than passed to the query — the column
  // is an enum, and Postgres errors rather than returning nothing.
  const status = isOrderStatus(params.status) ? params.status : undefined;
  const search = params.q?.trim() || undefined;
  const page = Number(params.page) || 1;

  const [result, settings] = await Promise.all([
    listOrders({ status, search, page }),
    getSettings(),
  ]);

  // One grouped query for the item counts rather than one per row. With 25
  // rows a page that is the difference between 2 queries and 26.
  const ids = result.rows.map((r) => r.id);
  const counts = ids.length
    ? await db
        .select({ orderId: orderItems.orderId, units: sql<number>`sum(${orderItems.qty})::int` })
        .from(orderItems)
        .where(inArray(orderItems.orderId, ids))
        .groupBy(orderItems.orderId)
    : [];

  const unitsByOrder = new Map(counts.map((c) => [c.orderId, c.units]));

  // Dates cross to a Client Component, so they travel as ISO strings.
  const rows: OrderRow[] = result.rows.map((r) => ({
    id: r.id,
    orderNumber: r.orderNumber,
    customerName: r.customerName,
    phone: r.phone,
    governorate: r.governorate,
    total: r.total,
    status: r.status,
    paymentStatus: r.paymentStatus,
    itemCount: unitsByOrder.get(r.id) ?? 0,
    createdAt: r.createdAt?.toISOString() ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--admin-text)]">{t('orders.title')}</h1>
        <p className="mt-1 text-sm text-[var(--admin-text-muted)]">
          {t('orders.subtitle')}
        </p>
      </div>

      <OrdersTable
        rows={rows}
        basePath={`${ADMIN_PATH}/commerce/orders`}
        currency={settings?.currency ?? 'JOD'}
        total={result.total}
        page={result.page}
        pageCount={result.pageCount}
        status={status ?? ''}
        search={search ?? ''}
      />
    </div>
  );
}
