// app/(admin)/admin/commerce/orders/page.tsx
import { SectionPlaceholder } from '@/components/admin/section-placeholder';

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';

export default function Page() {
  return (
    <SectionPlaceholder
      title="الطلبات"
      description="طلبات العملاء."
      backHref={ADMIN_PATH}
    />
  );
}
