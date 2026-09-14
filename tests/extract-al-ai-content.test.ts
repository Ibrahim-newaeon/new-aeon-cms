// tests/extract-al-ai-content.test.ts
//
// The head metadata the extractor lifts becomes a page's title in the CMS, so
// a wrong answer here is a wrong heading on a live page. The originals all
// carry the site name in front of the real title, which is the case worth
// pinning down.

import { describe, it, expect } from 'vitest';
import { extractTitle, extractDescription, titleFromSlug } from '../scripts/extract-al-ai-content.mjs';

describe('extractTitle', () => {
  /** Every original reads "al-ai.ai | Something"; the prefix is the layout's job. */
  it('drops the repeated site prefix', () => {
    expect(extractTitle('<title>al-ai.ai | About Us</title>', 'x')).toBe('About Us');
  });

  it('keeps a title that has no prefix', () => {
    expect(extractTitle('<title>Behavioral Intelligence</title>', 'x')).toBe(
      'Behavioral Intelligence'
    );
  });

  /** Splitting on the LAST bar: a title may legitimately contain one. */
  it('splits on the last separator, not the first', () => {
    expect(extractTitle('<title>al-ai.ai | Data | Driven</title>', 'x')).toBe('Driven');
  });

  it('decodes the entities a title actually carries', () => {
    expect(extractTitle('<title>al-ai.ai | Conversational &amp; Edge</title>', 'x')).toBe(
      'Conversational & Edge'
    );
  });

  it('collapses the whitespace of a wrapped title', () => {
    expect(extractTitle('<title>\n  al-ai.ai |\n  Services\n</title>', 'x')).toBe('Services');
  });

  /** A page titled only "al-ai.ai" would otherwise publish with a blank heading. */
  it('falls back when the title is nothing but the prefix', () => {
    expect(extractTitle('<title>al-ai.ai | </title>', 'Fallback')).toBe('Fallback');
  });

  it('falls back when there is no title at all', () => {
    expect(extractTitle('<head></head>', 'Fallback')).toBe('Fallback');
  });
});

describe('extractDescription', () => {
  it('reads the description meta whatever order its attributes are in', () => {
    expect(extractDescription('<meta content="Clean data" name="description">')).toBe('Clean data');
  });

  it('returns empty for the blank descriptions most of these pages have', () => {
    expect(extractDescription('<meta name="description" content="">')).toBe('');
    expect(extractDescription('<meta name="keywords" content="ai">')).toBe('');
  });

  it('does not confuse og:description for the real one', () => {
    expect(extractDescription('<meta property="og:description" content="Social">')).toBe('');
  });
});

describe('titleFromSlug', () => {
  it('makes a readable heading out of a filename', () => {
    expect(titleFromSlug('behavioral-intelligence')).toBe('Behavioral Intelligence');
    expect(titleFromSlug('home')).toBe('Home');
  });
});
