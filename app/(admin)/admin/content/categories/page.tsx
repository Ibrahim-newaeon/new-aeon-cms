// app/(admin)/admin/content/categories/page.tsx
import { db } from '@/lib/db';
import { categories, categoryI18n } from '@/lib/db/schema';
import { asc, eq } from 'drizzle-orm';
import { CategoriesManager, type CategoryRow } from '@/components/admin/categories-manager';

export default async function CategoriesPage() {
  const base = await db.select().from(categories).orderBy(asc(categories.sortOrder));
  const i18n = await db.select().from(categoryI18n);

  // Flatten both locales onto one row so the manager can edit them side by side
  // without a second round trip per category.
  const rows: CategoryRow[] = base.map((c) => {
    const ar = i18n.find((t) => t.categoryId === c.id && t.locale === 'ar');
    const en = i18n.find((t) => t.categoryId === c.id && t.locale === 'en');
    return {
      id: c.id,
      slug: c.slug,
      parentId: c.parentId,
      sortOrder: c.sortOrder ?? 0,
      isActive: c.isActive ?? true,
      nameAr: ar?.name ?? '',
      nameEn: en?.name ?? '',
      descriptionAr: ar?.description ?? '',
      descriptionEn: en?.description ?? '',
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--admin-text)]">الفئات</h1>
        <p className="mt-1 text-sm text-[var(--admin-text-muted)]">
          تنظيم المحتوى في تصنيفات، بمستوى واحد من التفريع.
        </p>
      </div>

      <CategoriesManager initial={rows} />
    </div>
  );
}
