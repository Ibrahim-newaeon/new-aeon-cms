// app/(admin)/admin/commerce/orders/[id]/page.tsx
import { notFound } from 'next/navigation';
import { getSettings } from '@/lib/db/queries';
import { getOrderDetail } from '@/lib/commerce/orders';
import { OrderDetail, type OrderDetailData } from '@/components/admin/order-detail';

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';

export const dynamic = 'force-dynamic';

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // A malformed id would make Postgres error on the uuid cast rather than
  // return no rows, so it is rejected before the query.
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [detail, settings] = await Promise.all([getOrderDetail(id), getSettings()]);
  if (!detail) notFound();

  const { order, items, history } = detail;

  // Dates cross to a Client Component, so they travel as ISO strings.
  const data: OrderDetailData = {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    customerName: order.customerName,
    phone: order.phone,
    email: order.email,
    governorate: order.governorate,
    city: order.city,
    addressLine: order.addressLine,
    landmark: order.landmark,
    notes: order.notes,
    couponCode: order.couponCode,
    subtotal: order.subtotal,
    discount: order.discount ?? 0,
    shipping: order.shipping,
    total: order.total,
    createdAt: order.createdAt?.toISOString() ?? null,
    items: items.map((i) => ({
      id: i.id,
      nameSnapshot: i.nameSnapshot,
      skuSnapshot: i.skuSnapshot,
      priceSnapshot: i.priceSnapshot,
      qty: i.qty,
    })),
    history: history.map((h) => ({
      id: h.id,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      note: h.note,
      createdAt: h.createdAt?.toISOString() ?? null,
    })),
  };

  return (
    <OrderDetail
      order={data}
      basePath={`${ADMIN_PATH}/commerce/orders`}
      currency={settings?.currency ?? 'JOD'}
    />
  );
}
