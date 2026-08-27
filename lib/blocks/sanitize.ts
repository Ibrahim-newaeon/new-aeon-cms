// lib/blocks/sanitize.ts
import sanitizeHtml from 'sanitize-html';

/**
 * Both HTML sinks in the renderer pass through here.
 *
 * The `html` block was rendered with a bare dangerouslySetInnerHTML under a
 * comment claiming it was sanitized — it was not. Any author-role user could
 * store a <script> tag on a published page.
 *
 * `rich-text` needs it too: TipTap's generateHTML faithfully reproduces
 * whatever attrs are in the stored JSON, including a link href of
 * "javascript:...", and that JSON is not trusted input either.
 */
const ALLOWED_SCHEMES = ['http', 'https', 'mailto', 'tel'];

const options: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'span', 'div',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 's', 'code', 'pre', 'blockquote',
    'ul', 'ol', 'li',
    'a', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    '*': ['dir', 'lang'],
    // Tailwind classes on trusted-shape output only; no style attribute, which
    // would allow expression()/url() tricks in older engines.
    span: ['dir', 'lang'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan', 'scope'],
  },
  allowedSchemes: ALLOWED_SCHEMES,
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  // Relative URLs (/uploads/...) must survive; they are same-origin.
  allowProtocolRelative: false,
  transformTags: {
    // Any link that opens a new tab must not hand the opener over.
    a: (tagName, attribs) => ({
      tagName,
      attribs: attribs.target
        ? { ...attribs, rel: 'noopener noreferrer' }
        : attribs,
    }),
  },
  disallowedTagsMode: 'discard',
};

export function sanitizeRichHtml(html: string): string {
  return sanitizeHtml(html, options);
}
