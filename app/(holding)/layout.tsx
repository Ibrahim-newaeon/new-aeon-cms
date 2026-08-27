// app/(holding)/layout.tsx
// ROOT layout for the coming-soon holding page. Deliberately separate from the
// (site) group: nothing here queries or renders real content, so none can leak
// into the RSC payload.
import type { Metadata } from 'next';
import { Cairo } from 'next/font/google';
import '../globals.css';

const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-cairo', display: 'swap' });

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function HoldingLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
