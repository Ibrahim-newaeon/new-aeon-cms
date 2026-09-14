// scripts/lib/split-sections.mjs
//
// Splits a page fragment into its top-level elements, so each section of a
// migrated page becomes its own `html` block instead of one 6 KB blob.
//
// Why that is worth doing: a single block is editable only by editing raw
// markup, and it cannot be reordered or removed section by section. One block
// per section gives an editor move-up, move-down and delete on each band of
// the page, which is most of what "editable" means in practice — without
// converting to structured blocks, which a theme pack would not render (see
// PACK_SUPPORTED_BLOCKS in lib/themes/blocks-to-html.ts).
//
// Written as a scanner rather than with a parser because htmlparser2 is only
// available transitively here, and adding a dependency to slice a string at
// depth zero is not a trade worth making. The scanner is deliberately narrow:
// it understands void elements, comments, and the two raw-text elements whose
// contents can otherwise look like markup. Anything it cannot account for
// makes the round-trip check fail, and a failed check refuses to split rather
// than guessing.

/** Elements with no closing tag. An unbalanced count here breaks every depth. */
const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/**
 * Elements whose content is text, not markup. `<` inside them is data — a
 * comparison in a script, say — and counting it as a tag corrupts the depth.
 */
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);

/**
 * Top-level chunks, in order, with every byte of the input preserved.
 *
 * Whitespace between elements is attached to the chunk that follows it, so
 * concatenating the result reproduces the input exactly. Returns null when the
 * markup does not close cleanly — an unbalanced fragment must not be split.
 */
export function splitTopLevel(html) {
  const parts = [];
  let depth = 0;
  let start = 0;
  let i = 0;

  while (i < html.length) {
    if (html[i] !== '<') { i += 1; continue; }

    // Comments and doctype: skipped whole, never counted.
    if (html.startsWith('<!--', i)) {
      const close = html.indexOf('-->', i + 4);
      if (close === -1) return null;
      i = close + 3;
      continue;
    }
    if (html.startsWith('<!', i)) {
      const close = html.indexOf('>', i);
      if (close === -1) return null;
      i = close + 1;
      continue;
    }

    const closing = html[i + 1] === '/';
    const nameAt = i + (closing ? 2 : 1);
    const name = (/^[a-zA-Z][a-zA-Z0-9-]*/.exec(html.slice(nameAt, nameAt + 40)) ?? [''])[0];
    if (!name) { i += 1; continue; }

    const gt = findTagEnd(html, i);
    if (gt === -1) return null;
    const selfClosing = html[gt - 1] === '/';
    const lower = name.toLowerCase();

    if (closing) {
      depth -= 1;
      if (depth === 0) {
        parts.push(html.slice(start, gt + 1));
        start = gt + 1;
      }
      if (depth < 0) return null;
      i = gt + 1;
      continue;
    }

    if (VOID.has(lower) || selfClosing) {
      if (depth === 0) {
        // A bare <img> or <hr> between sections is a chunk of its own.
        parts.push(html.slice(start, gt + 1));
        start = gt + 1;
      }
      i = gt + 1;
      continue;
    }

    if (RAW_TEXT.has(lower)) {
      const close = html.toLowerCase().indexOf(`</${lower}`, gt);
      if (close === -1) return null;
      const closeEnd = html.indexOf('>', close);
      if (closeEnd === -1) return null;
      if (depth === 0) {
        parts.push(html.slice(start, closeEnd + 1));
        start = closeEnd + 1;
      }
      i = closeEnd + 1;
      continue;
    }

    depth += 1;
    i = gt + 1;
  }

  if (depth !== 0) return null;

  // Trailing whitespace, so nothing is dropped.
  if (start < html.length) {
    const tail = html.slice(start);
    if (tail.trim() === '' && parts.length) parts[parts.length - 1] += tail;
    else if (tail.trim() !== '') return null;
  }

  // The guarantee. If the pieces do not reassemble into the original byte for
  // byte, the scanner misread something and the caller must not use them.
  if (parts.join('') !== html) return null;

  return parts.filter((p) => p.trim() !== '');
}

/** End of a tag, skipping `>` that appears inside a quoted attribute value. */
function findTagEnd(html, from) {
  let quote = null;
  for (let i = from; i < html.length; i += 1) {
    const ch = html[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '>') return i;
  }
  return -1;
}
