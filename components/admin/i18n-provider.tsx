// components/admin/i18n-provider.tsx
'use client';

import { createContext, useContext, useMemo } from 'react';
import { createTranslator, type AdminLocale, type Translator } from '@/lib/admin-i18n';

interface Ctx {
  locale: AdminLocale;
  t: Translator;
  dir: 'rtl' | 'ltr';
}

const AdminI18nContext = createContext<Ctx | null>(null);

export function AdminI18nProvider({
  locale,
  children,
}: {
  locale: AdminLocale;
  children: React.ReactNode;
}) {
  const value = useMemo<Ctx>(
    () => ({
      locale,
      t: createTranslator(locale),
      dir: locale === 'ar' ? 'rtl' : 'ltr',
    }),
    [locale]
  );

  return <AdminI18nContext.Provider value={value}>{children}</AdminI18nContext.Provider>;
}

export function useAdminI18n(): Ctx {
  const ctx = useContext(AdminI18nContext);
  if (!ctx) throw new Error('useAdminI18n must be used inside AdminI18nProvider');
  return ctx;
}

/** Shorthand for the common case. */
export function useT(): Translator {
  return useAdminI18n().t;
}
