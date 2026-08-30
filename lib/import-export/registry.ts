// lib/import-export/registry.ts
import { z } from 'zod';

/**
 * What each entity puts in a spreadsheet, and how a row comes back.
 *
 * Declarative on purpose. The route, the template, the dry run and the apply
 * step are all generic; an entity contributes columns and two functions. Adding
 * one should never mean touching the pipeline, which is how the other lists in
 * this codebase drifted apart.
 */

export interface ColumnDef {
  /** Spreadsheet header. Also the key in a parsed row. */
  key: string;
  labelEn: string;
  labelAr: string;
  /** Rejected when blank. */
  required?: boolean;
  /** Shown in the template's example row. */
  example?: string;
  /** Longer note for the person filling it in. */
  hintEn?: string;
}

export interface EntityDef {
  id: string;
  labelEn: string;
  labelAr: string;
  /**
   * The column that identifies an existing row. A re-import matches on it and
   * UPDATES; without one, importing the same file twice would duplicate
   * everything.
   *
   * `null` means export-only — orders and customers are records of things that
   * happened, not settings to be edited in Excel and pushed back.
   */
  naturalKey: string | null;
  columns: ColumnDef[];
  /** Row-level shape check. Cross-row rules live in the importer. */
  rowSchema: z.ZodTypeAny;
}

const text = (max = 255) => z.string().trim().max(max);
const optionalText = (max = 255) => text(max).optional().or(z.literal(''));

/** Money arrives as "129.000", "129", or "1,290.50" depending on the locale. */
const decimal = z
  .string()
  .trim()
  .regex(/^-?[\d,]*\.?\d+$/, 'must be a number');

const integer = z.string().trim().regex(/^\d+$/, 'must be a whole number');
const boolean = z
  .string()
  .trim()
  .regex(/^(true|false|yes|no|1|0|نعم|لا)$/i, 'must be yes or no');

export const ENTITIES: readonly EntityDef[] = [
  {
    id: 'products',
    labelEn: 'Products',
    labelAr: 'المنتجات',
    // SKU, not the product id: a shop knows its SKUs and does not know our
    // UUIDs, and a spreadsheet round-trip must survive being retyped.
    naturalKey: 'sku',
    columns: [
      { key: 'sku', labelEn: 'SKU', labelAr: 'رمز المنتج', required: true, example: 'AMBER-OUD-50' },
      { key: 'slug', labelEn: 'Slug', labelAr: 'الرابط', required: true, example: 'amber-oud' },
      { key: 'name_en', labelEn: 'Name (EN)', labelAr: 'الاسم (إنجليزي)', example: 'Amber Oud' },
      { key: 'name_ar', labelEn: 'Name (AR)', labelAr: 'الاسم (عربي)', example: 'عنبر وعود' },
      { key: 'brand', labelEn: 'Brand', labelAr: 'العلامة', example: 'Aeon Atelier' },
      { key: 'category', labelEn: 'Category', labelAr: 'التصنيف', example: 'general' },
      {
        key: 'price',
        labelEn: 'Price',
        labelAr: 'السعر',
        required: true,
        example: '129.000',
        hintEn: 'In major units, e.g. 129.000 for 129 JOD',
      },
      { key: 'compare_at_price', labelEn: 'Compare-at price', labelAr: 'السعر قبل الخصم', example: '' },
      { key: 'stock', labelEn: 'Stock', labelAr: 'المخزون', required: true, example: '50' },
      { key: 'option_name', labelEn: 'Option name', labelAr: 'اسم الخيار', example: 'Size' },
      { key: 'option_value', labelEn: 'Option value', labelAr: 'قيمة الخيار', example: '50ml' },
      { key: 'active', labelEn: 'Active', labelAr: 'مفعّل', example: 'yes' },
    ],
    rowSchema: z.object({
      sku: text(100),
      slug: text().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, numbers and dashes'),
      name_en: optionalText(),
      name_ar: optionalText(),
      brand: optionalText(),
      category: optionalText(),
      price: decimal,
      compare_at_price: decimal.optional().or(z.literal('')),
      stock: integer,
      option_name: optionalText(100),
      option_value: optionalText(),
      active: boolean.optional().or(z.literal('')),
    }),
  },

  {
    id: 'coupons',
    labelEn: 'Coupons',
    labelAr: 'الكوبونات',
    naturalKey: 'code',
    columns: [
      { key: 'code', labelEn: 'Code', labelAr: 'الرمز', required: true, example: 'WELCOME10' },
      {
        key: 'type',
        labelEn: 'Type',
        labelAr: 'النوع',
        required: true,
        example: 'percent',
        hintEn: 'percent or fixed',
      },
      { key: 'value', labelEn: 'Value', labelAr: 'القيمة', required: true, example: '10' },
      { key: 'min_subtotal', labelEn: 'Minimum subtotal', labelAr: 'أقل مجموع', example: '' },
      { key: 'max_uses', labelEn: 'Maximum uses', labelAr: 'أقصى استخدام', example: '100' },
      { key: 'expires_at', labelEn: 'Expires', labelAr: 'ينتهي في', example: '2026-12-31' },
      { key: 'active', labelEn: 'Active', labelAr: 'مفعّل', example: 'yes' },
    ],
    rowSchema: z.object({
      code: text(50),
      type: z.enum(['percent', 'fixed']),
      value: decimal,
      min_subtotal: decimal.optional().or(z.literal('')),
      max_uses: integer.optional().or(z.literal('')),
      expires_at: z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD')
        .optional()
        .or(z.literal('')),
      active: boolean.optional().or(z.literal('')),
    }),
  },

  {
    id: 'categories',
    labelEn: 'Categories',
    labelAr: 'التصنيفات',
    naturalKey: 'slug',
    columns: [
      { key: 'slug', labelEn: 'Slug', labelAr: 'الرابط', required: true, example: 'fragrance' },
      { key: 'name_en', labelEn: 'Name (EN)', labelAr: 'الاسم (إنجليزي)', example: 'Fragrance' },
      { key: 'name_ar', labelEn: 'Name (AR)', labelAr: 'الاسم (عربي)', example: 'العطور' },
      { key: 'parent', labelEn: 'Parent slug', labelAr: 'التصنيف الأب', example: '' },
      { key: 'sort_order', labelEn: 'Sort order', labelAr: 'الترتيب', example: '1' },
      { key: 'active', labelEn: 'Active', labelAr: 'مفعّل', example: 'yes' },
    ],
    rowSchema: z.object({
      slug: text().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, numbers and dashes'),
      name_en: optionalText(),
      name_ar: optionalText(),
      parent: optionalText(),
      sort_order: integer.optional().or(z.literal('')),
      active: boolean.optional().or(z.literal('')),
    }),
  },

  {
    id: 'brands',
    labelEn: 'Brands',
    labelAr: 'العلامات',
    naturalKey: 'slug',
    columns: [
      { key: 'slug', labelEn: 'Slug', labelAr: 'الرابط', required: true, example: 'aeon-atelier' },
      { key: 'name', labelEn: 'Name', labelAr: 'الاسم', required: true, example: 'Aeon Atelier' },
      { key: 'logo_url', labelEn: 'Logo URL', labelAr: 'رابط الشعار', example: '' },
      { key: 'sort_order', labelEn: 'Sort order', labelAr: 'الترتيب', example: '1' },
      { key: 'active', labelEn: 'Active', labelAr: 'مفعّل', example: 'yes' },
    ],
    rowSchema: z.object({
      slug: text().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, numbers and dashes'),
      name: text(),
      logo_url: optionalText(2048),
      sort_order: integer.optional().or(z.literal('')),
      active: boolean.optional().or(z.literal('')),
    }),
  },

  {
    id: 'tags',
    labelEn: 'Tags',
    labelAr: 'الوسوم',
    naturalKey: 'slug',
    columns: [
      { key: 'slug', labelEn: 'Slug', labelAr: 'الرابط', required: true, example: 'announcements' },
      { key: 'name', labelEn: 'Name', labelAr: 'الاسم', required: true, example: 'Announcements' },
      { key: 'name_en', labelEn: 'Name (EN)', labelAr: 'الاسم (إنجليزي)', example: '' },
      { key: 'name_ar', labelEn: 'Name (AR)', labelAr: 'الاسم (عربي)', example: '' },
    ],
    rowSchema: z.object({
      slug: text().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, numbers and dashes'),
      name: text(),
      name_en: optionalText(),
      name_ar: optionalText(),
    }),
  },

  {
    id: 'reviews',
    labelEn: 'Product reviews',
    labelAr: 'آراء العملاء',
    // (product, phone) is the pair the table already treats as one person's
    // review, so a re-import updates rather than duplicating.
    naturalKey: 'product_sku|phone',
    columns: [
      { key: 'product_sku', labelEn: 'Product SKU', labelAr: 'رمز المنتج', required: true, example: 'AMBER-OUD-50' },
      { key: 'author', labelEn: 'Author', labelAr: 'الاسم', required: true, example: 'Sara' },
      { key: 'phone', labelEn: 'Phone', labelAr: 'الهاتف', required: true, example: '0791234567' },
      { key: 'rating', labelEn: 'Rating', labelAr: 'التقييم', required: true, example: '5' },
      { key: 'body', labelEn: 'Review', labelAr: 'النص', example: 'Lovely scent.' },
      {
        key: 'status',
        labelEn: 'Status',
        labelAr: 'الحالة',
        example: 'pending',
        hintEn: 'pending, approved or rejected',
      },
    ],
    rowSchema: z.object({
      product_sku: text(100),
      author: text(),
      phone: text(50),
      rating: z.string().trim().regex(/^[1-5]$/, 'must be 1 to 5'),
      body: optionalText(2000),
      status: z.enum(['pending', 'approved', 'rejected']).optional().or(z.literal('')),
    }),
  },

  {
    id: 'customers',
    labelEn: 'Customers',
    labelAr: 'العملاء',
    /**
     * Export only.
     *
     * Customers are created by placing an order; the phone number is the merge
     * key that decides whether two orders are one person. Letting a spreadsheet
     * rewrite that would silently split or merge people's order histories, and
     * it is personal data besides.
     */
    naturalKey: null,
    columns: [
      { key: 'name', labelEn: 'Name', labelAr: 'الاسم' },
      { key: 'phone', labelEn: 'Phone', labelAr: 'الهاتف' },
      { key: 'email', labelEn: 'Email', labelAr: 'البريد' },
      { key: 'orders', labelEn: 'Orders', labelAr: 'الطلبات' },
      { key: 'total_spent', labelEn: 'Total spent', labelAr: 'إجمالي الإنفاق' },
      { key: 'first_order', labelEn: 'First order', labelAr: 'أول طلب' },
      { key: 'last_order', labelEn: 'Last order', labelAr: 'آخر طلب' },
    ],
    rowSchema: z.object({}),
  },
] as const;

export const findEntity = (id: string) => ENTITIES.find((e) => e.id === id);

export const isImportable = (entity: EntityDef) => entity.naturalKey !== null;

/** The header row for an entity's file. */
export const headersFor = (entity: EntityDef) => entity.columns.map((c) => c.key);

/**
 * A blank template with one example row.
 *
 * The example is what stops "what goes in this column?" — a header alone
 * leaves the format of a price or a date to guesswork, and guesswork is what
 * the dry run then has to reject.
 */
export function templateFor(entity: EntityDef) {
  return {
    headers: headersFor(entity),
    rows: [entity.columns.map((c) => c.example ?? '')],
  };
}
