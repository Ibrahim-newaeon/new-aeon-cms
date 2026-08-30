'use client';

import { useRouter } from 'next/navigation';

export function AccountSignOut({ locale }: { locale: 'ar' | 'en' }) {
  const router = useRouter();

  return (
    <button
      type="button"
      data-test-id="account-signout"
      onClick={async () => {
        await fetch('/api/account/logout', { method: 'POST', credentials: 'same-origin' });
        router.refresh();
      }}
      className="site-btn-outline py-1.5 text-sm"
    >
      {locale === 'ar' ? 'تسجيل الخروج' : 'Sign out'}
    </button>
  );
}
