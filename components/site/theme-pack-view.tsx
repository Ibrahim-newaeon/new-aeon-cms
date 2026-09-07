// components/site/theme-pack-view.tsx
// Renders an HTML theme pack output inside the Next document shell.

export function ThemePackView({
  html,
  cssHrefs = [],
  jsHrefs = [],
}: {
  html: string;
  cssHrefs?: string[];
  jsHrefs?: string[];
}) {
  return (
    <div data-test-id="theme-pack-view" data-theme-pack>
      {cssHrefs.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {jsHrefs.map((href) => (
        <script key={href} src={href} defer />
      ))}
    </div>
  );
}
