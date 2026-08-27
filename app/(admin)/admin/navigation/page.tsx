// app/(admin)/admin/navigation/page.tsx
import { db } from '@/lib/db';
import { navigation, navigationI18n } from '@/lib/db/schema';
import { asc } from 'drizzle-orm';
import { NavigationManager, type NavRow } from '@/components/admin/navigation-manager';
import type { NavLocation } from '@/lib/navigation-schema';

export default async function NavigationPage() {
  const items = await db.select().from(navigation).orderBy(asc(navigation.order));
  const labels = await db.select().from(navigationI18n);

  // Both locales flattened onto one row so the editor shows them side by side.
  const rows: NavRow[] = items.map((n) => ({
    id: n.id,
    label: n.label,
    labelAr: labels.find((l) => l.navigationId === n.id && l.locale === 'ar')?.label ?? '',
    labelEn: labels.find((l) => l.navigationId === n.id && l.locale === 'en')?.label ?? '',
    url: n.url,
    location: (n.location ?? 'header') as NavLocation,
    parentId: n.parentId,
    order: n.order ?? 0,
    isActive: n.isActive ?? true,
    openInNew: n.openInNew ?? false,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--admin-text)]">القوائم والواجهة</h1>
        <p className="mt-1 text-sm text-[var(--admin-text-muted)]">
          عناصر التنقل في الموقع العام — اسحب لإعادة الترتيب.
        </p>
      </div>

      <NavigationManager initial={rows} />
    </div>
  );
}
