// tests/price-direction.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * No price may hard-code dir="ltr".
 *
 * Intl returns an Arabic price already wrapped in U+200F marks. Forcing LTR
 * over that re-orders a string that was already ordered — the same price laid
 * out 74px instead of 52, with the currency on the wrong side. It looks
 * correct in English, which is why it was written that way in a dozen places
 * and why hunting them by eye missed two.
 *
 * A source check rather than a browser one: this is a rule about how the code
 * is written, it costs nothing to run, and it names the file and line. The
 * rendered behaviour is covered separately in e2e/arabic.spec.ts.
 */
function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith('.tsx') ? [full] : [];
  });
}

describe('price direction', () => {
  it('no storefront price is wrapped in a hard-coded dir="ltr"', () => {
    const offenders: string[] = [];

    for (const file of [...tsxFiles('components/site'), ...tsxFiles('app/(site)')]) {
      const lines = readFileSync(file, 'utf8').split('\n');

      lines.forEach((line, i) => {
        if (!line.includes('formatPrice(')) return;
        // The opening tag sits within a few lines above the value.
        const window = lines.slice(Math.max(0, i - 4), i + 1).join('\n');
        if (window.includes('dir="ltr"')) offenders.push(`${file}:${i + 1}`);
      });
    }

    expect(
      offenders,
      `Use dir={locale === 'ar' ? undefined : 'ltr'} (or the Price component):\n  ${offenders.join('\n  ')}`
    ).toEqual([]);
  });

  it('the Price component exists and decides direction from the locale', () => {
    // The intended home for this rule; the check above is the backstop for
    // places that still format inline.
    const source = readFileSync('components/site/price.tsx', 'utf8');
    expect(source).toContain("locale === 'ar' ? undefined : 'ltr'");
  });
});
