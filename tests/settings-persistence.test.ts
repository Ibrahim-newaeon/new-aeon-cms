// tests/settings-persistence.test.ts
//
// app/api/settings/route.ts writes its update field by field. That is fine
// until a field is added to settingsSchema and to the form and forgotten here:
// the value then validates, returns 200, and is discarded. Four fields had
// been in that state — brandAnswer, allowAiCrawlers, whatsappNumber and
// whatsappGreeting — and nothing failed, because nothing was checking.
//
// The round trip has TWO field-by-field lists, and the first fix only covered
// one of them. The settings page builds `initial` the same way, and the form
// holds a single `value` object seeded from it and submits the whole thing —
// so a field missing from `initial` is submitted as undefined and written as
// null. A value saved correctly would be erased by the next unrelated save.
// Both lists are checked here.
//
// Reading source is blunt, but the alternative is a database. The guard
// assertions below fail loudly if either shape it parses ever changes.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { settingsSchema } from '@/lib/settings-schema';

const source = readFileSync(
  path.resolve(import.meta.dirname, '..', 'app/api/settings/route.ts'),
  'utf8'
);

/** The object literal handed to db.update()/db.insert(). */
const valuesBlock = (() => {
  const at = source.indexOf('const values = {');
  const end = source.indexOf('\n    };', at);
  expect(at, 'route no longer builds `const values = {`').toBeGreaterThan(-1);
  expect(end, 'could not find the end of the values literal').toBeGreaterThan(at);
  return source.slice(at, end);
})();

const written = new Set(
  [...valuesBlock.matchAll(/^\s{6}([a-zA-Z][A-Za-z0-9]*):/gm)].flatMap((m) => (m[1] ? [m[1]] : []))
);

const pageSource = readFileSync(
  path.resolve(import.meta.dirname, '..', 'app/(admin)/admin/settings/page.tsx'),
  'utf8'
);

/** The `initial` object the settings page hands to the form. */
const initialBlock = (() => {
  const at = pageSource.indexOf('const initial: SettingsInput = {');
  const end = pageSource.indexOf('\n  };', at);
  expect(at, 'settings page no longer builds `const initial`').toBeGreaterThan(-1);
  expect(end, 'could not find the end of the initial literal').toBeGreaterThan(at);
  return pageSource.slice(at, end);
})();

const seeded = new Set(
  [...initialBlock.matchAll(/^\s{4}([a-zA-Z][A-Za-z0-9]*):/gm)].flatMap((m) => (m[1] ? [m[1]] : []))
);

const accepted = Object.keys(settingsSchema.shape);

describe('settings route persistence', () => {
  it('parses a values literal at all', () => {
    expect(written.size).toBeGreaterThan(20);
  });

  /**
   * The whole point. A field the API accepts but never writes is a form
   * control that looks like it works and does nothing.
   */
  it('writes every field settingsSchema accepts', () => {
    const dropped = accepted.filter((key) => !written.has(key));
    expect(dropped, `accepted by the schema but never written: ${dropped.join(', ')}`).toEqual([]);
  });

  it.each(['brandAnswer', 'allowAiCrawlers', 'whatsappNumber', 'whatsappGreeting'])(
    'persists %s, which used to be dropped',
    (field) => {
      expect(written.has(field)).toBe(true);
    }
  );

  it('parses an initial literal at all', () => {
    expect(seeded.size).toBeGreaterThan(20);
  });

  /**
   * The other half of the round trip, and the one the first fix missed.
   */
  it('seeds the form with every field settingsSchema accepts', () => {
    const missing = accepted.filter((key) => !seeded.has(key));
    expect(missing, `written to the database but never read back: ${missing.join(', ')}`).toEqual([]);
  });

  it.each(['brandAnswer', 'allowAiCrawlers', 'whatsappNumber', 'whatsappGreeting'])(
    'reads %s back into the form',
    (field) => {
      expect(seeded.has(field)).toBe(true);
    }
  );

  /** Same default on both sides, or one save flips it. */
  it('seeds allowAiCrawlers as allowed', () => {
    expect(initialBlock).toMatch(/allowAiCrawlers:\s*s\?\.allowAiCrawlers\s*\?\?\s*true/);
  });

  /**
   * Absent means "crawlers allowed", matching the form's `!== false` default.
   * `?? false` here would silently start blocking AI crawlers on every save
   * made by an older client that does not send the field.
   */
  it('defaults allowAiCrawlers to allowed, not blocked', () => {
    expect(valuesBlock).toMatch(/allowAiCrawlers:\s*data\.allowAiCrawlers\s*\?\?\s*true/);
  });
});
