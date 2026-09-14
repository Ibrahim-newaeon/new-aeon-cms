// tests/pack-block-support.test.ts
//
// blocksToHtml() renders 10 of the 33 block types and returns '' for the rest.
// That is deliberate at render time — a broken widget inside a customer's
// theme is worse than nothing — but on its own it is a trap: the admin block
// picker offers all 33 whatever the driver, so an editor on a theme-pack site
// can add a Stats block, fill it in, save, and get an empty page and no error.
//
// PACK_SUPPORTED_BLOCKS is what the picker reads to badge the others. It is
// hand-written, so this checks it against the switch it claims to describe.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PACK_SUPPORTED_BLOCKS } from '@/lib/themes/blocks-to-html';
import { ALL_BLOCK_TYPES } from '@/lib/blocks/defaults';

const source = readFileSync(
  path.resolve(import.meta.dirname, '..', 'lib/themes/blocks-to-html.ts'),
  'utf8'
);

/** `case 'heading':` inside blockToHtml's switch. */
const cases = new Set(
  [...source.matchAll(/^\s*case '([a-z-]+)':/gm)].flatMap((m) => (m[1] ? [m[1]] : []))
);

describe('theme-pack block support', () => {
  it('finds the switch at all', () => {
    expect(cases.size).toBeGreaterThan(5);
  });

  /** The point: the exported set IS the switch, not a memory of it. */
  it('matches the switch exactly', () => {
    expect([...PACK_SUPPORTED_BLOCKS].sort()).toEqual([...cases].sort());
  });

  it('every listed type is a real block type', () => {
    for (const type of PACK_SUPPORTED_BLOCKS) {
      expect(ALL_BLOCK_TYPES).toContain(type);
    }
  });

  /**
   * Named individually because these are the ones a migration from pasted HTML
   * would reach for first, and each renders as nothing under a theme pack.
   */
  it.each(['stats', 'feature-grid', 'slider', 'gallery', 'team', 'testimonial', 'faq'])(
    '%s is correctly reported as unsupported',
    (type) => {
      expect(PACK_SUPPORTED_BLOCKS.has(type as never)).toBe(false);
    }
  );

  it('leaves most of the library unsupported, which is the situation', () => {
    const unsupported = ALL_BLOCK_TYPES.filter((t) => !PACK_SUPPORTED_BLOCKS.has(t));
    expect(unsupported.length).toBe(ALL_BLOCK_TYPES.length - PACK_SUPPORTED_BLOCKS.size);
    expect(unsupported.length).toBeGreaterThan(20);
  });
});
