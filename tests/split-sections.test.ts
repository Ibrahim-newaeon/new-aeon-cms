// tests/split-sections.test.ts
//
// The splitter turns one page-sized html block into one block per section, so
// an editor can move or delete a band of the page without editing raw markup.
// It runs over a client's live content, so the bar is not "usually right": it
// must either reproduce the input exactly or refuse.
//
// That is the property worth testing. Everything else — how many pieces, where
// the whitespace lands — only matters because it feeds the round trip.

import { describe, it, expect } from 'vitest';
import { splitTopLevel } from '../scripts/lib/split-sections.mjs';
import { htmlBlocks } from '../scripts/publish-site-pages.mjs';

const join = (parts: string[] | null) => (parts ?? []).join('');

describe('splitTopLevel', () => {
  it('splits siblings', () => {
    const html = '<section>a</section><section>b</section>';
    expect(splitTopLevel(html)).toEqual(['<section>a</section>', '<section>b</section>']);
  });

  it('keeps nested elements whole', () => {
    const html = '<div><p>one</p><p>two</p></div><div>b</div>';
    expect(splitTopLevel(html)).toHaveLength(2);
  });

  /** Whitespace rides with the piece that follows, so nothing is lost. */
  it('preserves every byte, whitespace included', () => {
    const html = '\n\t<section>a</section>\n\n\t<section>b</section>\n';
    expect(join(splitTopLevel(html))).toBe(html);
  });

  /** A void element has no closing tag; counting one breaks every depth after it. */
  it('handles void elements at any depth', () => {
    const html = '<div><img src="a.png"><br></div><hr><section>b</section>';
    const parts = splitTopLevel(html);
    expect(parts).toHaveLength(3);
    expect(join(parts)).toBe(html);
  });

  it('handles self-closing syntax', () => {
    const html = '<div><img src="a.png" /></div><div>b</div>';
    expect(splitTopLevel(html)).toHaveLength(2);
  });

  /** `>` inside an attribute is data, not the end of the tag. */
  it('is not fooled by angle brackets inside attributes', () => {
    const html = '<div data-x="a > b"><p>c</p></div><div>d</div>';
    const parts = splitTopLevel(html);
    expect(parts).toHaveLength(2);
    expect(join(parts)).toBe(html);
  });

  /** `<` inside a script is a comparison, not a tag. */
  it('treats script and style content as text', () => {
    const html = '<script>if (a<b) {}</script><div>after</div>';
    const parts = splitTopLevel(html);
    expect(parts).toHaveLength(2);
    expect(join(parts)).toBe(html);
  });

  it('skips comments without counting them', () => {
    const html = '<!-- <div> --><section>a</section>';
    expect(join(splitTopLevel(html))).toBe(html);
  });

  it('drops nothing when a bare element sits between sections', () => {
    const html = '<section>a</section><hr><section>b</section>';
    expect(join(splitTopLevel(html))).toBe(html);
  });

  /**
   * The refusals. Unbalanced markup split into pieces would be repaired
   * independently by the sanitiser, silently reshaping a customer's page.
   */
  it('refuses an unclosed element', () => {
    expect(splitTopLevel('<div><p>a</div>')).toBeNull();
  });

  it('refuses a stray closing tag', () => {
    expect(splitTopLevel('<div>a</div></div>')).toBeNull();
  });

  it('refuses an unterminated comment', () => {
    expect(splitTopLevel('<div>a</div><!-- oops')).toBeNull();
  });

  it('refuses an unterminated tag', () => {
    expect(splitTopLevel('<div>a</div><section')).toBeNull();
  });

  it('ignores text outside any element rather than guessing', () => {
    expect(splitTopLevel('<div>a</div>trailing text')).toBeNull();
  });
});

describe('htmlBlocks', () => {
  const page = '<section>a</section><section>b</section>';

  it('makes one block per section when splitting', () => {
    expect(htmlBlocks(page, true)).toEqual([
      { type: 'html', content: '<section>a</section>' },
      { type: 'html', content: '<section>b</section>' },
    ]);
  });

  it('makes a single block when not splitting', () => {
    expect(htmlBlocks(page, false)).toEqual([{ type: 'html', content: page }]);
  });

  /** A page that will not split cleanly is published whole, not mangled. */
  it('falls back to one block when the markup will not split', () => {
    const broken = '<div><p>a</div>';
    expect(htmlBlocks(broken, true)).toEqual([{ type: 'html', content: broken }]);
  });

  it('does not split a page that is one element', () => {
    const single = '<div><p>a</p><p>b</p></div>';
    expect(htmlBlocks(single, true)).toHaveLength(1);
  });
});
