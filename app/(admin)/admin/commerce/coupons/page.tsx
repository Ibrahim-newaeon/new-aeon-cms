// app/(admin)/admin/commerce/coupons/page.tsx
import { SectionPlaceholder } from '@/components/admin/section-placeholder';

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';

export default function Page() {
  return (
    <SectionPlaceholder
      title="كوبونات الخصم"
      description="أكواد الخصم والعروض."
      backHref={ADMIN_PATH}
    />
  );
}
