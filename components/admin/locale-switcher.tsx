// components/admin/locale-switcher.tsx
'use client';

import { useTransition } from 'react';
import { Languages } from 'lucide-react';
import { setAdminLocale } from '@/lib/admin-i18n/actions';
import { useAdminI18n } from './i18n-provider';
import { cn } from '@/lib/utils';

/**
 * Switches the admin UI language. The preference is a cookie, not a URL
 * segment, so every existing ADMIN_PATH link keeps working — and the server
 * action revalidates the layout so <html lang/dir> flips with it.
 */
export function LocaleSwitcher() {
  const { locale, t } = useAdminI18n();
  const [pending, startTransition] = useTransition();

  const next = locale === 'ar' ? 'en' : 'ar';

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => void setAdminLocale(next))}
      aria-label={t('common.language')}
      title={t('common.language')}
      data-test-id="admin-locale-switcher"
      className={cn(
        'admin-btn-ghost px-3 py-1.5 text-xs',
        pending && 'opacity-50'
      )}
    >
      <Languages size={14} aria-hidden="true" />
      <span dir="ltr">{next === 'en' ? 'EN' : 'ع'}</span>
    </button>
  );
}
