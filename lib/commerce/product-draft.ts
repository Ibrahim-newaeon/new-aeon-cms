// lib/commerce/product-draft.ts
// Shared between the server pages and the client product form.
//
// NOT in components/admin/product-form.tsx: that file is 'use client', so
// anything exported from it becomes a client reference and calling it from a
// Server Component throws at request time. This is the second time that trap
// was hit in this project — see lib/content/page-draft.ts for the first.

export interface ProductTranslationDraft {
  locale: 'ar' | 'en';
  name: string;
  shortDesc: string;
  description: string;
  metaTitle: string;
  metaDescription: string;
}

export interface VariantDraft {
  /** Minor units — see lib/money.ts. */
  price: number;
  sku: string;
  stock: number;
  isActive: boolean;
  optionValues: Record<string, string>;
}

export interface ProductFormValue {
  slug: string;
  brandId: string | null;
  categoryId: string | null;
  basePrice: number;
  compareAtPrice: number | null;
  isActive: boolean;
  sortOrder: number;
  translations: ProductTranslationDraft[];
  images: { url: string; alt: string }[];
  specs: { locale: 'ar' | 'en'; key: string; value: string }[];
  options: { name: string; position: number }[];
  variants: VariantDraft[];
}

export function emptyProductTranslation(locale: 'ar' | 'en'): ProductTranslationDraft {
  return {
    locale,
    name: '',
    shortDesc: '',
    description: '',
    metaTitle: '',
    metaDescription: '',
  };
}
