// tests/dockerfile-build-args.test.ts
//
// next.config.ts is evaluated by `next build`, and whatever it reads from the
// environment is BAKED into the output: the redirect table, next/image's
// remotePatterns. Inside docker/Dockerfile that build runs in the builder
// stage, which starts from a bare image — a variable set on the running
// container is invisible to it.
//
// Miss one and nothing fails. legacyRedirects() reads undefined, returns [],
// and every old URL 404s; an empty redirect table looks exactly like one that
// was never configured. That shipped: LEGACY_REDIRECTS was set correctly on
// the al-ai.ai service and every .html from the previous site still 404'd.
//
// So this checks the rule rather than the instance: every variable the config
// reads must be declared in the builder stage.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = (rel: string) => readFileSync(path.resolve(import.meta.dirname, '..', rel), 'utf8');

const config = read('next.config.ts');
const dockerfile = read('docker/Dockerfile');

/** Everything next.config.ts reads from the environment. */
const readByConfig = new Set(
  [...config.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)].flatMap((m) => (m[1] ? [m[1]] : []))
);

/** The builder stage: from its FROM line to the next one. */
const builderStage = (() => {
  const stages = dockerfile.split(/^FROM /m);
  const builder = stages.find((s) => /AS builder/i.test(s.split('\n')[0] ?? ''));
  expect(builder, 'no builder stage found in docker/Dockerfile').toBeTruthy();
  return builder as string;
})();

const declared = new Set(
  [...builderStage.matchAll(/^(?:ARG|ENV) ([A-Z_][A-Z0-9_]*)/gm)].flatMap((m) => (m[1] ? [m[1]] : []))
);

/**
 * A local escape hatch for the browser test suite (`NEXT_STANDALONE=0`), never
 * set for an image: the Dockerfile copies .next/standalone and needs the
 * default. Exempt because its absence is the correct value here, not an
 * oversight.
 */
const NOT_NEEDED_IN_IMAGE = new Set(['NEXT_STANDALONE']);

describe('build-time variables reach the Docker build', () => {
  it('finds both files to compare', () => {
    expect(readByConfig.size).toBeGreaterThan(2);
    expect(declared.size).toBeGreaterThan(2);
  });

  /** The rule. Adding a build-time variable without an ARG fails here. */
  it('declares every variable next.config.ts reads', () => {
    const missing = [...readByConfig].filter(
      (name) => !declared.has(name) && !NOT_NEEDED_IN_IMAGE.has(name)
    );
    expect(
      missing,
      `read by next.config.ts but not declared in the builder stage: ${missing.join(', ')}`
    ).toEqual([]);
  });

  it.each(['LEGACY_REDIRECTS', 'S3_PUBLIC_URL', 'S3_ENDPOINT'])(
    '%s is both an ARG and an ENV, so a build arg actually reaches the build',
    (name) => {
      expect(builderStage).toMatch(new RegExp(`^ARG ${name}=`, 'm'));
      expect(builderStage).toMatch(new RegExp(`^ENV ${name}=\\$\\{${name}\\}`, 'm'));
    }
  );

  /**
   * ARG alone is a build-time parameter the running process cannot see; ENV
   * alone cannot be supplied from outside. next.config.ts reads process.env,
   * so both are required and the pairing is the part that is easy to half-do.
   */
  it('pairs every ARG it declares with a matching ENV', () => {
    const args = [...builderStage.matchAll(/^ARG ([A-Z_][A-Z0-9_]*)=/gm)].flatMap((m) =>
      m[1] ? [m[1]] : []
    );
    const unpaired = args.filter(
      (name) => !new RegExp(`^ENV ${name}=\\$\\{${name}\\}`, 'm').test(builderStage)
    );
    expect(unpaired, `ARG with no matching ENV: ${unpaired.join(', ')}`).toEqual([]);
  });
});
