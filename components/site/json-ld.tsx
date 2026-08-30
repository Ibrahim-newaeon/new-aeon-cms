// components/site/json-ld.tsx

/**
 * Renders a schema.org node as a <script type="application/ld+json"> block.
 *
 * The type is not a JavaScript MIME type, so the browser treats the contents as
 * a DATA BLOCK and never executes it. That is also why it survives the CSP in
 * middleware.ts without a nonce: `script-src` governs execution, and nothing
 * here executes.
 *
 * Not executing is not the same as being safe to inject, which is what the
 * escaping below is for.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialise(data) }}
    />
  );
}

/**
 * The values here are product names and descriptions — editor input, and in the
 * imported catalogue's case, someone else's export.
 *
 * JSON.stringify escapes quotes but NOT `<`, and the HTML parser stops the
 * script at the first `</script` regardless of JSON quoting. A product named
 * `Oud </script><script>…` would therefore close this block and open a real
 * one. Escaping `<` as its < form is still valid JSON, parses to the same
 * string, and cannot terminate the element.
 */
function serialise(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
