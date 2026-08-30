// tests/theme.test.ts
import { describe, it, expect } from 'vitest';
import { COLOR_SLOTS, themeSchema, themeToCss, themeToFile, hexToChannels } from '@/lib/theme/slots';
import { parseThemeFile, contrastRatio, checkContrast } from '@/lib/theme/import';

describe('theme slots', () => {
  it('every slot has a valid hex fallback', () => {
    // The fallbacks are what an unfilled site renders, and they are also what
    // the export hands a designer as a starting point.
    for (const slot of COLOR_SLOTS) {
      expect(slot.fallback, slot.name).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('rejects an unknown slot rather than dropping it', () => {
    // Silently ignoring a key is how "I uploaded my brand and nothing changed"
    // becomes unanswerable.
    expect(themeSchema.safeParse({ accent: '#112233' }).success).toBe(true);
    expect(themeSchema.safeParse({ notASlot: '#112233' }).success).toBe(false);
  });

  it('rejects anything that is not a six-digit hex', () => {
    for (const bad of ['red', '#abc', 'rgb(1,2,3)', '#12345', 'javascript:x']) {
      expect(themeSchema.safeParse({ accent: bad }).success, bad).toBe(false);
    }
  });

  it('rejects a radius that is not a length', () => {
    expect(themeSchema.safeParse({ radius: '8px' }).success).toBe(true);
    expect(themeSchema.safeParse({ radius: '0' }).success).toBe(true);
    // The radius lands in a stylesheet, so "8px; } body { display:none" must
    // never parse.
    expect(themeSchema.safeParse({ radius: '8px; } body { display:none' }).success).toBe(false);
  });
});

describe('themeToCss', () => {
  it('emits the hex slot and its channel twin', () => {
    // Both, because Tailwind's /opacity modifier cannot inject an alpha into a
    // var() — given one it silently produces black.
    const css = themeToCss({ accent: '#0f7b5a' });
    expect(css).toContain('--site-accent:#0f7b5a;');
    expect(css).toContain('--site-accent-rgb:15 123 90;');
  });

  it('emits nothing for an empty theme, rather than an empty rule', () => {
    expect(themeToCss({})).toBe('');
    expect(themeToCss(null)).toBe('');
  });

  it('skips a value that is not a hex colour even if it reaches this far', () => {
    // Defence in depth: the validator runs first, but this function writes
    // directly into a <style> tag and must not depend on that.
    expect(themeToCss({ accent: 'red; } * { display: none' } as never)).toBe('');
  });

  it('converts channels correctly', () => {
    expect(hexToChannels('#000000')).toBe('0 0 0');
    expect(hexToChannels('#ffffff')).toBe('255 255 255');
    expect(hexToChannels('#1a2b3c')).toBe('26 43 60');
  });
});

describe('themeToFile', () => {
  it('fills every slot, so the export doubles as a template', () => {
    const file = themeToFile({ accent: '#0f7b5a' });
    expect(file.accent).toBe('#0f7b5a');
    // Not overridden, so the default appears rather than being absent — the
    // point is that a designer receives a complete sheet to edit.
    expect(file.surface).toBe('#ffffff');
    expect(Object.keys(file)).toHaveLength(COLOR_SLOTS.length + 1);
  });
});

describe('parseThemeFile', () => {
  it('reads our own flat export', () => {
    const result = parseThemeFile(JSON.stringify({ accent: '#0f7b5a', radius: '2px' }));
    expect(result.theme.accent).toBe('#0f7b5a');
    expect(result.theme.radius).toBe('2px');
    expect(result.unknown).toEqual([]);
  });

  it('reads W3C design tokens, which is what Figma exports', () => {
    const result = parseThemeFile(
      JSON.stringify({ color: { accent: { $value: '#0f7b5a' }, ink: { $value: '#111827' } } })
    );
    expect(result.theme.accent).toBe('#0f7b5a');
    expect(result.theme.ink).toBe('#111827');
  });

  it('reads a CSS custom-property paste', () => {
    const result = parseThemeFile(':root { --site-accent: #0f7b5a; --site-ink: #111827; }');
    expect(result.theme.accent).toBe('#0f7b5a');
    expect(result.theme.ink).toBe('#111827');
  });

  it('takes only custom properties out of a stylesheet, never rules', () => {
    // The "paste your CSS" route has to be safe: everything that is not a
    // custom property is discarded rather than applied.
    const result = parseThemeFile(`
      @import url('http://evil.example/x.css');
      body { display: none }
      :root { --site-accent: #0f7b5a; }
      a:hover { background: url(javascript:alert(1)) }
    `);
    expect(result.theme).toEqual({ accent: '#0f7b5a' });
  });

  it('accepts the spellings a design file actually uses', () => {
    const result = parseThemeFile(
      JSON.stringify({ accentHover: '#0c6349', accent_ink: '#ffffff', 'surface-raised': '#eeeeee' })
    );
    expect(result.theme['accent-hover']).toBe('#0c6349');
    expect(result.theme['accent-ink']).toBe('#ffffff');
    expect(result.theme['surface-raised']).toBe('#eeeeee');
  });

  it('expands short hex', () => {
    expect(parseThemeFile(JSON.stringify({ accent: '#0f8' })).theme.accent).toBe('#00ff88');
  });

  it('reports unknown keys instead of swallowing them', () => {
    const result = parseThemeFile(JSON.stringify({ accent: '#0f7b5a', brandGradient: '#123456' }));
    expect(result.applied).toContain('accent');
    expect(result.unknown).toContain('brandGradient');
  });

  it('reports a recognised slot with an unusable value', () => {
    // rgb() is refused rather than half-converted: a wrong colour is worse
    // than a reported one.
    const result = parseThemeFile(JSON.stringify({ accent: 'rgb(15,123,90)' }));
    expect(result.theme.accent).toBeUndefined();
    expect(result.invalid[0]?.name).toBe('accent');
  });

  it('refuses a file it cannot recognise at all', () => {
    expect(() => parseThemeFile('just some words')).toThrow();
    expect(() => parseThemeFile('{ not json')).toThrow();
  });
});

describe('contrast', () => {
  it('matches the known WCAG extremes', () => {
    expect(Math.round(contrastRatio('#000000', '#ffffff'))).toBe(21);
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1);
  });

  it('flags white text on a pale brand colour', () => {
    // The exact mistake a shop owner makes: a light accent with white ink
    // gives buttons nobody can read, and they will not notice.
    const failures = checkContrast({ accent: '#ffe08a', 'accent-ink': '#ffffff' });
    expect(failures.map((f) => f.label)).toContain('Text on the brand colour');
  });

  it('passes a readable pairing', () => {
    expect(checkContrast({ accent: '#0f7b5a', 'accent-ink': '#ffffff' })).toEqual([]);
  });
});
