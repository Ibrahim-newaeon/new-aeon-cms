// app/(root)/layout.tsx
//
// ROOT layout for the bare `/` URL, which exists only to redirect.
//
// It cannot reuse the storefront's layout: that one lives at
// app/(site)/[locale]/layout.tsx and needs a locale segment, which is the very
// thing `/` has not got yet. Nothing here is ever seen — page.tsx redirects
// before rendering — so this stays a bare document rather than loading fonts
// and providers for a page with no content.
export default function RootRedirectLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
