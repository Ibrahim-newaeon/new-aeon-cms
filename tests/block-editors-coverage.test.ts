// tests/block-editors-coverage.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ALL_BLOCK_TYPES, EDITABLE_BLOCKS, BLOCK_LABEL_KEYS } from '@/lib/blocks/defaults';
import { ar, en } from '@/lib/admin-i18n/messages';

/**
 * EDITABLE_BLOCKS decides whether the picker shows a "Soon" badge, but nothing
 * connected it to whether an editor exists. Seven block types shipped working
 * editors and kept the badge, which tells an editor a feature is missing when
 * it is sitting right there — the worst direction for this to fail in, because
 * nobody clicks the thing to find out.
 *
 * Editors live in TWO places, which is what made the drift hard to see:
 *
 *   - block-editors.tsx dispatches most types from a switch.
 *   - block-builder.tsx handles rich-text, accordion and tabs itself. The
 *     latter two nest ContentBlock[] and recurse into BlockBuilder, which
 *     cannot live in block-editors.tsx without the two modules importing each
 *     other.
 *
 * Both sites are parsed rather than listed by hand. A hand-written list is
 * precisely what failed here — an earlier version of this test hardcoded
 * accordion and tabs as "stubbed" and asserted the wrong thing confidently.
 *
 * Reading source is admittedly blunt. The alternative is rendering the editors,
 * which needs a DOM and a React testing dependency this suite deliberately does
 * without (see vitest.config.mts). Each regex is guarded by its own assertion,
 * so restructuring a dispatch fails loudly instead of passing vacuously.
 */
const read = (rel: string) =>
  readFileSync(path.resolve(import.meta.dirname, '..', rel), 'utf8');

const editorSource = read('components/admin/block-editors.tsx');
const builderSource = read('components/admin/block-builder.tsx');

/** `case 'heading':` in the BlockEditor switch. */
const fromEditorSwitch = [...editorSource.matchAll(/^\s*case '([a-z-]+)':/gm)];

/** `block.type === 'accordion'` in the BlockBuilder ternary chain. */
const fromBuilder = [...builderSource.matchAll(/block\.type === '([a-z-]+)'/g)];

// flatMap rather than map: the capture group is `string | undefined` under
// noUncheckedIndexedAccess, and widening the set would defeat the comparison.
const capture = (ms: RegExpMatchArray[]) => ms.flatMap((m) => (m[1] ? [m[1]] : []));

const dispatched = new Set<string>([...capture(fromEditorSwitch), ...capture(fromBuilder)]);

describe('block editor coverage', () => {
  it('finds both dispatch sites at all', () => {
    // Guards the regexes: if either dispatch stops looking like this, every
    // assertion below would trivially pass while proving nothing.
    expect(fromEditorSwitch.length).toBeGreaterThan(20);
    expect(fromBuilder.length).toBeGreaterThanOrEqual(3);
  });

  it('marks a block editable exactly when some editor dispatches it', () => {
    const editable = [...EDITABLE_BLOCKS].sort();
    const withEditor = [...dispatched]
      .filter((t) => (ALL_BLOCK_TYPES as string[]).includes(t))
      .sort();
    expect(editable).toEqual(withEditor);
  });

  it('leaves no block type without an editor', () => {
    // Every type is currently editable, so the "Soon" badge renders nowhere.
    // A new block type added without an editor lands here — build one, or add
    // it to EDITABLE_BLOCKS' exclusions deliberately rather than by omission.
    const stubbed = ALL_BLOCK_TYPES.filter((t) => !EDITABLE_BLOCKS.has(t));
    expect(stubbed).toEqual([]);
  });

  it('gives every block type a label that resolves in both locales', () => {
    for (const type of ALL_BLOCK_TYPES) {
      const key = BLOCK_LABEL_KEYS[type];
      expect(ar[key], `ar is missing ${key}`).toBeTruthy();
      expect(en[key], `en is missing ${key}`).toBeTruthy();
    }
  });
});
