// app/(admin)/admin/commerce/shipping/page.tsx
import { db } from '@/lib/db';
import { shippingZones, orders } from '@/lib/db/schema';
import { asc, count, eq } from 'drizzle-orm';
import { getSettings } from '@/lib/db/queries';
import {
  ShippingZonesManager,
  type ShippingZoneRow,
} from '@/components/admin/shipping-zones-manager';

export default async function ShippingPage() {
  // The order count drives the disabled delete button, so the 409 from the API
  // is predictable rather than something the user discovers by clicking.
  const [rows, settings] = await Promise.all([
    db
      .select({
        id: shippingZones.id,
        name: shippingZones.name,
        governorates: shippingZones.governorates,
        flatRate: shippingZones.flatRate,
        freeOver: shippingZones.freeOver,
        etaDays: shippingZones.etaDays,
        isActive: shippingZones.isActive,
        sortOrder: shippingZones.sortOrder,
        orderCount: count(orders.id),
      })
      .from(shippingZones)
      .leftJoin(orders, eq(orders.shippingZoneId, shippingZones.id))
      .groupBy(
        shippingZones.id,
        shippingZones.name,
        shippingZones.governorates,
        shippingZones.flatRate,
        shippingZones.freeOver,
        shippingZones.etaDays,
        shippingZones.isActive,
        shippingZones.sortOrder
      )
      .orderBy(asc(shippingZones.sortOrder), asc(shippingZones.name)),
    getSettings(),
  ]);

  const initial: ShippingZoneRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    governorates: r.governorates ?? [],
    flatRate: r.flatRate,
    freeOver: r.freeOver,
    etaDays: r.etaDays ?? 3,
    isActive: r.isActive ?? true,
    sortOrder: r.sortOrder ?? 0,
    orderCount: Number(r.orderCount),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--admin-text)]">مناطق الشحن</h1>
        <p className="mt-1 text-sm text-[var(--admin-text-muted)]">
          كل محافظة تنتمي إلى منطقة واحدة مفعّلة على الأكثر. المحافظات غير المشمولة تُرفض عند إتمام
          الطلب.
        </p>
      </div>

      <ShippingZonesManager initial={initial} currency={settings?.currency ?? 'JOD'} />
    </div>
  );
}
