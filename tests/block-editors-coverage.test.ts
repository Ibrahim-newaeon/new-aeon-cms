// tests/block-editors-coverage.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ALL_BLOCK_TYPES, EDITABLE_BLOCKS, BLOCK_LABEL_KEYS } from '@/lib/blocks/defaults';
import { ar, en } from '@/lib/admin-i18n/messages';

/**
 * EDITABLE_BLOCKS decides whether the picker shows a "Soon" badge, but nothing
 * connected it to whether an editor actually exists. Five block types shipped
 * working editors and kept the badge, which tells an editor a feature is
 * missing when it is sitting right there — the worst direction for this to
 * fail in, because nobody clicks the thing to find out.
 *
 * Reading the source is admittedly blunt. The alternative is rendering
 * BlockEditor, which needs a DOM and a React testing dependency this suite
 * deliberately does without (see vitest.config.mts). Parsing the switch keeps
 * the invariant pinned at no cost, and it fails loudly if the dispatch is ever
 * restructured out of a switch — which is the correct outcome, not a false
 * pass.
 */
const editorSource = readFileSync(
  path.resolve(import.meta.dirname, '../components/admin/block-editors.tsx'),
  'utf8'
);

/** `rich-text` is dispatched by BlockBuilder, not BlockEditor, so it has no case. */
const HANDLED_ELSEWHERE = new Set(['rich-text']);

const dispatched = new Set<string>([
  ...HANDLED_ELSEWHERE,
  // flatMap rather than map: the capture group is `string | undefined` under
  // noUncheckedIndexedAccess, and widening the set to include undefined would
  // quietly defeat the comparison below.
  ...[...editorSource.matchAll(/^\s*case '([a-z-]+)':/gm)].flatMap((m) =>
    m[1] ? [m[1]] : []
  ),
]);

describe('block editor coverage', () => {
  it('finds the dispatch switch at all', () => {
    // Guards the regex above: if the editor stops being a switch, every other
    // assertion here would trivially pass while proving nothing.
    expect(dispatched.size).toBeGreaterThan(20);
  });

  it('marks a block editable exactly when an editor dispatches it', () => {
    const editable = [...EDITABLE_BLOCKS].sort();
    const withEditor = [...dispatched].filter((t) =>
      (ALL_BLOCK_TYPES as string[]).includes(t)
    ).sort();
    expect(editable).toEqual(withEditor);
  });

  it('leaves only the nested-content blocks stubbed', () => {
    // accordion and tabs nest ContentBlock[], so they need a recursive editor.
    // When one is built, delete it from here in the same commit.
    const stubbed = ALL_BLOCK_TYPES.filter((t) => !EDITABLE_BLOCKS.has(t));
    expect(stubbed.sort()).toEqual(['accordion', 'tabs']);
  });

  it('gives every block type a label that resolves in both locales', () => {
    for (const type of ALL_BLOCK_TYPES) {
      const key = BLOCK_LABEL_KEYS[type];
      expect(ar[key], `ar is missing ${key}`).toBeTruthy();
      expect(en[key], `en is missing ${key}`).toBeTruthy();
    }
  });
});
