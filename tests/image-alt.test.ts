// tests/image-alt.test.ts
//
// This script and scripts/remap-content-media.mjs both key on an image's file
// name, and the remap CHANGES it: /uploads/al-ai/hero.png becomes
// /uploads/2026/09/<uuid>.png. Run the alt tooling afterwards and a map
// written against the original names matches nothing, silently — which is
// exactly what happened on the al-ai migration, and cost a detour to diagnose.
//
// `--media` resolves between the two names in both directions. These cover
// that resolution and the tag rewriting, which is the other place a mistake
// would land in a customer's markup rather than in an error.

import { describe, it, expect } from 'vitest';
import {
  nameMaps, keyFor, lookup, withAlt, altOf, srcOf, basename,
} from '../scripts/apply-image-alt.mjs';

const media = nameMaps({
  success: true,
  data: [
    { originalName: 'hero.png', url: '/uploads/2026/09/aaaa-1111.png' },
    { originalName: 'team.jpg', url: '/uploads/2026/09/bbbb-2222.jpg' },
  ],
});

describe('name resolution', () => {
  it('maps an original name to its stored name and back', () => {
    expect(media.toStored.get('hero.png')).toBe('aaaa-1111.png');
    expect(media.toOriginal.get('aaaa-1111.png')).toBe('hero.png');
  });

  it('accepts a bare array as well as the API envelope', () => {
    const bare = nameMaps([{ originalName: 'x.png', url: '/uploads/2026/09/cccc.png' }]);
    expect(bare.toStored.get('x.png')).toBe('cccc.png');
  });

  /**
   * Re-uploading a file leaves both rows in place, and the newer one is what
   * an editor just put there.
   *
   * /api/media orders by createdAt DESC, so index 0 is the NEWEST — which is
   * why nameMaps walks the list in reverse. The fixture is in that order on
   * purpose: written newest-last it would prove the opposite of what the real
   * payload does, which is the mistake this comment exists to prevent.
   */
  it('lets the newest upload win, given the order the API returns', () => {
    const dupes = nameMaps([
      { originalName: 'a.png', url: '/uploads/2026/09/new.png' },
      { originalName: 'a.png', url: '/uploads/2026/08/old.png' },
    ]);
    expect(dupes.toStored.get('a.png')).toBe('new.png');
  });

  it('ignores rows missing either half', () => {
    const partial = nameMaps([{ originalName: 'a.png' }, { url: '/uploads/x.png' }]);
    expect(partial.toStored.size).toBe(0);
  });

  /** A report full of uuids cannot be filled in by a human. */
  it('keys a report by the original name when the media list knows one', () => {
    expect(keyFor('aaaa-1111.png', media)).toBe('hero.png');
    expect(keyFor('unknown.png', media)).toBe('unknown.png');
    expect(keyFor('aaaa-1111.png', null)).toBe('aaaa-1111.png');
  });
});

describe('map lookup', () => {
  const map = { 'hero.png': { alt: 'A hero' } };

  /** The bug: an original-named map against remapped markup. */
  it('finds an original-named entry from the stored name', () => {
    expect(lookup(map, 'aaaa-1111.png', media)?.alt).toBe('A hero');
  });

  it('still finds a direct match', () => {
    expect(lookup(map, 'hero.png', media)?.alt).toBe('A hero');
  });

  it('works the other way round, for a map written after the remap', () => {
    const stored = { 'aaaa-1111.png': { alt: 'A hero' } };
    expect(lookup(stored, 'hero.png', media)?.alt).toBe('A hero');
  });

  it('finds nothing without a media list, which is the failure to warn about', () => {
    expect(lookup(map, 'aaaa-1111.png', null)).toBeUndefined();
  });
});

describe('tag rewriting', () => {
  it('adds alt to a tag that has none', () => {
    expect(withAlt('<img src="a.png">', 'Some text')).toBe('<img src="a.png" alt="Some text">');
  });

  it('preserves self-closing syntax', () => {
    expect(withAlt('<img src="a.png" />', 'T')).toBe('<img src="a.png" alt="T" />');
  });

  it('replaces an existing alt rather than adding a second', () => {
    const out = withAlt('<img alt="old" src="a.png">', 'new');
    expect(out).toBe('<img alt="new" src="a.png">');
    expect(out.match(/alt=/g)).toHaveLength(1);
  });

  /**
   * Alt text is prose and will contain quotes and ampersands. Unescaped, a
   * double quote ends the attribute and the rest of the sentence is parsed as
   * bogus attributes — a broken tag in a client's page.
   */
  it('escapes quotes and ampersands', () => {
    const out = withAlt('<img src="a.png">', 'Say "hi" & wave');
    expect(out).toContain('alt="Say &quot;hi&quot; &amp; wave"');
    expect(out.endsWith('>')).toBe(true);
  });

  it('keeps other attributes', () => {
    expect(withAlt('<img class="x" src="a.png" width="10">', 'T')).toContain('class="x"');
  });
});

describe('tag reading', () => {
  it('distinguishes a missing alt from an empty one', () => {
    expect(altOf('<img src="a.png">')).toBeNull();
    expect(altOf('<img src="a.png" alt="">')).toBe('');
  });

  it('reads src and strips query and hash from the name', () => {
    expect(srcOf('<img src="/uploads/a.png">')).toBe('/uploads/a.png');
    expect(basename('/uploads/2026/09/a.png?v=2#x')).toBe('a.png');
  });
});
