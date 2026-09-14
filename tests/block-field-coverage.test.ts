// tests/block-field-coverage.test.ts
//
// tests/block-editors-coverage.test.ts proves every block TYPE reaches some
// editor. That is a weaker claim than it sounds: a type can dispatch to an
// editor that offers inputs for three of its six fields, and nothing notices.
//
// Five fields were in that state — image.caption, quote.source,
// button.fullWidth, contact-form.successMessage and newsletter.privacyNote.
// Each rendered on the live page and could not be entered anywhere. Four more
// (video.autoplay, team social, timeline icon, recent-posts category) were
// declared and implemented nowhere at all, and have been removed.
//
// This pins the fields that were fixed and the fields that were deleted, at
// the two seams where each kind of regression would reappear.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = (rel: string) => readFileSync(path.resolve(import.meta.dirname, '..', rel), 'utf8');

const types = read('lib/blocks/types.ts');
const editors = read('components/admin/block-editors.tsx');

/** One `case 'x':` arm of the BlockEditor switch, up to the next arm. */
function editorCase(name: string): string {
  const marks = [...editors.matchAll(/^\s*case '([a-z-]+)':|^\s*default:/gm)];
  const at = marks.findIndex((m) => m[1] === name);
  expect(at, `no editor case for ${name}`).toBeGreaterThan(-1);
  const from = marks[at]!.index!;
  const to = at + 1 < marks.length ? marks[at + 1]!.index! : editors.length;
  return editors.slice(from, to);
}

describe('fields that render must have an input', () => {
  /**
   * Scoped to the block's own case arm. A global search would pass on the
   * strength of an identically-named field somewhere else — which is exactly
   * how slider's `autoplay` masked video's, and feature-grid's `icon` masked
   * timeline's, when this was first audited by hand.
   */
  it.each([
    ['image', 'caption'],
    ['quote', 'source'],
    ['button', 'fullWidth'],
    ['contact-form', 'successMessage'],
    ['newsletter', 'privacyNote'],
  ])('%s.%s is editable', (block, field) => {
    expect(editorCase(block)).toContain(field);
  });

  /** An input that never writes back is the same bug wearing a control. */
  it.each([
    ['image', 'caption'],
    ['quote', 'source'],
    ['button', 'fullWidth'],
  ])('%s.%s writes its value back to the block', (block, field) => {
    expect(editorCase(block)).toMatch(new RegExp(`onChange\\(\\{[^}]*\\.\\.\\.block,[\\s\\S]{0,80}${field}`));
  });
});

describe('fields implemented nowhere stay deleted', () => {
  it('video has no autoplay', () => {
    expect(types).toMatch(/type: 'video';[^}]*\}/);
    expect(/type: 'video';[^}]*autoplay/.test(types)).toBe(false);
  });

  it('team members carry no social map', () => {
    expect(/type: 'team';[^}]*social\?/.test(types)).toBe(false);
  });

  it('timeline items carry no icon', () => {
    expect(/type: 'timeline';[^}]*icon\?/.test(types)).toBe(false);
  });

  it('recent-posts has no category', () => {
    expect(/type: 'recent-posts';[^}]*category\?/.test(types)).toBe(false);
  });

  /**
   * The near-misses. Both look like the deleted fields and both are real:
   * removing either because it resembles one of the four would take working,
   * editable features off the page.
   */
  it('keeps feature-grid icon and slider autoplay, which do work', () => {
    expect(/type: 'feature-grid';[^}]*icon\?/.test(types)).toBe(true);
    expect(editorCase('feature-grid')).toContain('icon');
    expect(types).toMatch(/autoplay: boolean;/);
    expect(editorCase('slider')).toContain('autoplay');
  });
});
