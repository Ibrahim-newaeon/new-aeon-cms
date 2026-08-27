// app/(admin)/admin/commerce/coupons/page.tsx
import { db } from '@/lib/db';
import { coupons } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { getSettings } from '@/lib/db/queries';
import { CouponsManager, type CouponRow } from '@/components/admin/coupons-manager';

export default async function CouponsPage() {
  const [rows, settings] = await Promise.all([
    db.select().from(coupons).orderBy(desc(coupons.createdAt)),
    getSettings(),
  ]);

  // Dates cross to a Client Component, so they travel as ISO strings.
  const initial: CouponRow[] = rows.map((r) => ({
    id: r.id,
    code: r.code,
    type: r.type,
    value: r.value,
    minSubtotal: r.minSubtotal ?? 0,
    usageLimit: r.usageLimit,
    usedCount: r.usedCount ?? 0,
    startsAt: r.startsAt?.toISOString() ?? null,
    endsAt: r.endsAt?.toISOString() ?? null,
    isActive: r.isActive ?? true,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--admin-text)]">أكواد الخصم</h1>
        <p className="mt-1 text-sm text-[var(--admin-text-muted)]">
          الخصم يُحتسب على المجموع الفرعي فقط، ولا يُخفّض قيمة الشحن ولا ينزل بالإجمالي تحت الصفر.
        </p>
      </div>

      <CouponsManager initial={initial} currency={settings?.currency ?? 'JOD'} />
    </div>
  );
}
