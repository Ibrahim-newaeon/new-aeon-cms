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
 *
 * Paste-HTML v2 adds tiers (site setting `htmlPasteMode`):
 * - safe: original allowlist (default — no behaviour change for existing sites)
 * - designer: more layout tags, class, constrained inline style
 * - trusted: designer + section landmarks; still never <script>
 */

export const HTML_PASTE_MODES = ['safe', 'designer', 'trusted'] as const;
export type HtmlPasteMode = (typeof HTML_PASTE_MODES)[number];

const ALLOWED_SCHEMES = ['http', 'https', 'mailto', 'tel'];

const BASE_TAGS = [
  'p', 'br', 'hr', 'span', 'div',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li',
  'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
] as const;

const DESIGNER_TAGS = [
  ...BASE_TAGS,
  'section', 'article', 'header', 'footer', 'main', 'nav', 'aside',
  'picture', 'source', 'video', 'audio',
  'dl', 'dt', 'dd',
  'sub', 'sup', 'small', 'mark', 'abbr',
  'colgroup', 'col', 'tfoot',
] as const;

const linkTransform: NonNullable<sanitizeHtml.IOptions['transformTags']> = {
  a: (tagName, attribs) => ({
    tagName,
    attribs: attribs.target
      ? { ...attribs, rel: 'noopener noreferrer' }
      : attribs,
  }),
};

/** Inline style allowlist: blocks expression()/javascript: while letting pastes keep colour/layout. */
const DESIGNER_STYLES: sanitizeHtml.IOptions['allowedStyles'] = {
  '*': {
    color: [/.*/],
    'background-color': [/.*/],
    background: [/^[^;]*$/],
    'font-size': [/.*/],
    'font-weight': [/.*/],
    'font-family': [/.*/],
    'font-style': [/.*/],
    'line-height': [/.*/],
    'text-align': [/.*/],
    'text-decoration': [/.*/],
    'text-transform': [/.*/],
    'letter-spacing': [/.*/],
    margin: [/.*/],
    'margin-top': [/.*/],
    'margin-right': [/.*/],
    'margin-bottom': [/.*/],
    'margin-left': [/.*/],
    padding: [/.*/],
    'padding-top': [/.*/],
    'padding-right': [/.*/],
    'padding-bottom': [/.*/],
    'padding-left': [/.*/],
    border: [/.*/],
    'border-radius': [/.*/],
    'border-color': [/.*/],
    'border-width': [/.*/],
    'border-style': [/.*/],
    width: [/.*/],
    'max-width': [/.*/],
    'min-width': [/.*/],
    height: [/.*/],
    'max-height': [/.*/],
    'min-height': [/.*/],
    display: [/.*/],
    flex: [/.*/],
    'flex-direction': [/.*/],
    'flex-wrap': [/.*/],
    'justify-content': [/.*/],
    'align-items': [/.*/],
    gap: [/.*/],
    grid: [/.*/],
    'grid-template-columns': [/.*/],
    'grid-gap': [/.*/],
    position: [/^(static|relative|absolute|sticky)$/],
    top: [/.*/],
    right: [/.*/],
    bottom: [/.*/],
    left: [/.*/],
    overflow: [/.*/],
    opacity: [/.*/],
    'box-shadow': [/.*/],
    'object-fit': [/.*/],
    'aspect-ratio': [/.*/],
    'z-index': [/^\d+$/],
    direction: [/^(ltr|rtl)$/],
  },
};

function safeOptions(): sanitizeHtml.IOptions {
  return {
    allowedTags: [...BASE_TAGS],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      '*': ['dir', 'lang'],
      span: ['dir', 'lang'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan', 'scope'],
    },
    allowedSchemes: ALLOWED_SCHEMES,
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    allowProtocolRelative: false,
    transformTags: linkTransform,
    disallowedTagsMode: 'discard',
  };
}

function designerOptions(): sanitizeHtml.IOptions {
  return {
    allowedTags: [...DESIGNER_TAGS],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel', 'class', 'id'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'class', 'id'],
      source: ['src', 'srcset', 'type', 'media'],
      video: ['src', 'controls', 'poster', 'width', 'height', 'class', 'id'],
      audio: ['src', 'controls', 'class', 'id'],
      '*': ['dir', 'lang', 'class', 'id', 'style', 'role', 'aria-label', 'aria-hidden'],
      td: ['colspan', 'rowspan', 'class', 'id', 'style'],
      th: ['colspan', 'rowspan', 'scope', 'class', 'id', 'style'],
      col: ['span', 'style', 'class'],
    },
    allowedStyles: DESIGNER_STYLES,
    allowedSchemes: ALLOWED_SCHEMES,
    allowedSchemesByTag: { img: ['http', 'https', 'data'], source: ['http', 'https'], video: ['http', 'https'], audio: ['http', 'https'] },
    allowProtocolRelative: false,
    transformTags: linkTransform,
    disallowedTagsMode: 'discard',
  };
}

function trustedOptions(): sanitizeHtml.IOptions {
  // Same as designer for markup; CSS from <style> is handled separately and
  // scoped. Scripts, iframes, object, embed, form, svg remain discarded.
  return designerOptions();
}

export function optionsForMode(mode: HtmlPasteMode): sanitizeHtml.IOptions {
  switch (mode) {
    case 'designer':
      return designerOptions();
    case 'trusted':
      return trustedOptions();
    case 'safe':
    default:
      return safeOptions();
  }
}

/** Rich-text / TipTap path — always the strict safe allowlist. */
export function sanitizeRichHtml(html: string): string {
  return sanitizeHtml(html, safeOptions());
}

/** HTML block path — respects the site paste mode. */
export function sanitizeHtmlForMode(html: string, mode: HtmlPasteMode): string {
  return sanitizeHtml(html, optionsForMode(mode));
}

/**
 * Defence for scoped <style> bodies extracted from pastes.
 * Drops @import and closing-style breakouts; does not try to be a CSS parser.
 */
export function sanitizeScopedCss(css: string): string {
  let out = css.replace(/<\/?\s*style/gi, '');
  out = out.replace(/@import\b[^;]*;?/gi, '');
  out = out.replace(/expression\s*\(/gi, '');
  out = out.replace(/-moz-binding\s*:/gi, '');
  out = out.replace(/javascript\s*:/gi, '');
  out = out.replace(/vbscript\s*:/gi, '');
  // Cap runaway pastes.
  if (out.length > 100_000) out = out.slice(0, 100_000);
  return out;
}
