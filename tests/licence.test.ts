// tests/licence.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

/**
 * The licence files are shipped artefacts, and the kind that rot quietly:
 * nobody notices a stale notices file or a flipped `private` flag until a
 * client's lawyer does.
 */
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

describe('package metadata', () => {
  it('is marked private, so an accidental publish is at least one step harder', () => {
    // Note: on npm 11 this is not the FIRST guard — see LICENSING.md. It is a
    // layer, not the protection.
    expect(pkg.private).toBe(true);
  });

  it('points at the licence file rather than claiming an SPDX identifier', () => {
    // "MIT" here would be a false claim in package metadata, which is exactly
    // where tooling looks first.
    expect(pkg.license).toBe('SEE LICENSE IN LICENSE');
  });
});

describe('LICENSE', () => {
  const text = existsSync('LICENSE') ? readFileSync('LICENSE', 'utf8') : '';

  it('exists and is a real agreement', () => {
    expect(text.length).toBeGreaterThan(2000);
  });

  it('says plainly that it is not open source', () => {
    // The single most important sentence for someone skimming it.
    expect(text).toContain('NOT OPEN-SOURCE SOFTWARE');
  });

  it('covers the clauses a commercial licence has to have', () => {
    for (const clause of [
      'GRANT',
      'RESTRICTIONS',
      'THIRD-PARTY COMPONENTS',
      'OWNERSHIP',
      'TERM AND TERMINATION',
      'WARRANTY DISCLAIMER',
      'LIMITATION OF LIABILITY',
      'GOVERNING LAW',
    ]) {
      expect(text, `missing clause: ${clause}`).toContain(clause);
    }
  });

  it('still carries the placeholder that must be filled before issuing', () => {
    /**
     * Deliberately asserted PRESENT. This test is the reminder: when the
     * contact address is filled in, this expectation flips and whoever changes
     * it has to read LICENSING.md's issuing checklist to know why.
     */
    expect(text).toContain('<set a contact address here before issuing>');
  });
});

describe('third-party notices', () => {
  const notices = existsSync('THIRD-PARTY-NOTICES.md')
    ? readFileSync('THIRD-PARTY-NOTICES.md', 'utf8')
    : '';

  it('exists, because shipping this redistributes hundreds of packages', () => {
    expect(notices.length).toBeGreaterThan(1000);
  });

  it('lists roughly as many packages as are installed', () => {
    // Catches a notices file left behind by a dependency change. Generous
    // bounds: the point is to notice a drift of dozens, not of one.
    const listed = (notices.match(/^\| \S+ \| \S+ \| /gm) ?? []).length;
    const declared = Object.keys(pkg.dependencies ?? {}).length;
    expect(listed).toBeGreaterThan(declared);
    expect(listed).toBeGreaterThan(200);
  });

  it('calls out the licences that need more than attribution', () => {
    expect(notices).toContain('LGPL-3.0-or-later');
    expect(notices).toContain('Worth reading before you ship');
  });
});
