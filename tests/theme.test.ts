// tests/theme.test.ts
import { describe, it, expect } from 'vitest';
import {
  COLOR_SLOTS,
  themeSchema,
  themeToCss,
  themeToFile,
  hexToChannels,
  themePairToCss,
  themePairToFile,
  themeModeAttr,
  resolveDark,
  hasDark,
} from '@/lib/theme/slots';
import { parseThemeFile, parseDesignFile, contrastRatio, checkContrast } from '@/lib/theme/import';
import { SKINS, findSkin } from '@/lib/theme/presets';
import { effectiveMode, parseVisitorMode } from '@/lib/theme/visitor-mode';

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


describe('skins', () => {
  /** Both halves of every skin, flattened, so no loop can quietly skip one. */
  const VARIANTS = SKINS.flatMap((skin) => [
    { id: `${skin.id}.light`, theme: skin.light },
    // The dark half as the cascade actually serves it. A dark theme is allowed
    // to omit a slot and inherit the light value, so this is what must be
    // checked — not the raw object.
    { id: `${skin.id}.dark`, theme: resolveDark(skin.light, skin.dark) },
  ]);

  it('every skin fills every slot in both variants', () => {
    // A partial skin would leave the previous choice showing through the gaps,
    // so switching would half-apply.
    for (const { id, theme } of VARIANTS) {
      for (const slot of COLOR_SLOTS) {
        expect(theme[slot.name], `${id}.${slot.name}`).toMatch(/^#[0-9a-f]{6}$/);
      }
      expect(theme.radius, `${id}.radius`).toBeTruthy();
    }
  });

  it('every variant passes the validator the API uses', () => {
    for (const { id, theme } of VARIANTS) {
      const parsed = themeSchema.safeParse(theme);
      expect(parsed.success, `${id}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it('every variant is readable', () => {
    // Shipping a skin whose buttons cannot be read is worse than shipping none:
    // a business reasonably assumes the built-in choices are safe. The dark
    // halves are hand-written, which is exactly why they are asserted — a dark
    // theme is where a plausible-looking palette most often fails.
    for (const { id, theme } of VARIANTS) {
      expect(checkContrast(theme), id).toEqual([]);
    }
  });

  it('every dark variant is actually darker than its light twin', () => {
    // Guards against a copy-paste that leaves a skin's dark half holding the
    // light colours — which would pass every check above, because a light
    // theme is perfectly readable. It just would not be dark.
    for (const skin of SKINS) {
      const lum = (hex: string) => contrastRatio(hex, '#000000');
      expect(
        lum(skin.dark.surface!),
        `${skin.id}: dark surface is not darker than light`
      ).toBeLessThan(lum(skin.light.surface!));
    }
  });

  it('has unique ids', () => {
    expect(new Set(SKINS.map((s) => s.id)).size).toBe(SKINS.length);
    expect(findSkin('forest')?.nameEn).toBe('Forest');
    expect(findSkin('nope')).toBeUndefined();
  });
});

describe('light and dark', () => {
  const light = { surface: '#ffffff', ink: '#111827' };
  const dark = { surface: '#0b1220', ink: '#e8eefc' };

  it('emits only the light block when no dark variant is saved', () => {
    // A site with no dark colours must not be handed an empty dark stylesheet,
    // which would blank the page for anyone whose device is set to dark.
    const css = themePairToCss(light, null);
    expect(css).toContain('--site-surface:#ffffff');
    expect(css).not.toContain('prefers-color-scheme');
    expect(themePairToCss(light, {})).toBe(css);
  });

  it('emits all three states when a dark variant exists', () => {
    const css = themePairToCss(light, dark);

    // Light is the base.
    expect(css).toContain(':root{');
    expect(css).toContain('--site-surface:#ffffff');

    // The device asked for dark — but not if the business forced light.
    expect(css).toContain('@media (prefers-color-scheme:dark){:root:not([data-theme="light"])');

    // Dark was forced, and must win on a light device too.
    expect(css).toContain(':root[data-theme="dark"]{');

    expect(css).toContain('--site-surface:#0b1220');
  });

  it('resolves an unset dark slot to its light value', () => {
    // Only `surface` differs; ink must come through from light rather than
    // being dropped, or the dark block would leave body text at the browser
    // default.
    const css = themePairToCss(light, { surface: '#0b1220' });
    const darkBlock = css.slice(css.indexOf('[data-theme="dark"]'));
    expect(darkBlock).toContain('--site-surface:#0b1220');
    expect(darkBlock).toContain('--site-ink:#111827');
  });

  it('emits the channel twin in the dark block too', () => {
    // text-site-ink/70 in a dark section needs it as much as in a light one;
    // without it Tailwind's opacity modifier silently produces black.
    const css = themePairToCss(light, dark);
    expect(css.slice(css.indexOf('[data-theme="dark"]'))).toContain('--site-ink-rgb:232 238 252');
  });

  it('stamps nothing for auto', () => {
    // The ABSENCE of the attribute is what lets the media query decide.
    // Stamping "auto" would match neither selector and pin everyone to light.
    expect(themeModeAttr('auto')).toBeUndefined();
    expect(themeModeAttr(null)).toBeUndefined();
    expect(themeModeAttr('light')).toBe('light');
    expect(themeModeAttr('dark')).toBe('dark');
  });

  it('knows an empty dark theme from a real one', () => {
    expect(hasDark(null)).toBe(false);
    expect(hasDark({})).toBe(false);
    expect(hasDark({ surface: undefined })).toBe(false);
    expect(hasDark({ surface: '#0b1220' })).toBe(true);
  });

  it('the forced-light guard survives a dark device', () => {
    // The regression this exists for: without :not([data-theme="light"]) the
    // media query would override a business that deliberately forced light.
    const css = themePairToCss(light, dark);
    const media = css.slice(css.indexOf('@media'));
    expect(media.slice(0, media.indexOf('{', media.indexOf(':root')))).toContain(
      ':not([data-theme="light"])'
    );
  });
});

describe('design files carrying both variants', () => {
  it('round-trips a whole skin through export and import', () => {
    // The property that matters for portability: what comes out of one site
    // goes into another and produces the same two themes.
    const skin = SKINS.find((s) => s.id === 'sand')!;
    const file = themePairToFile(skin.light, skin.dark);
    const parsed = parseDesignFile(JSON.stringify(file));

    expect(parsed.single).toBeUndefined();
    expect(parsed.light!.theme.accent).toBe(skin.light.accent);
    expect(parsed.dark!.theme.accent).toBe(skin.dark.accent);
    expect(parsed.light!.unknown).toEqual([]);
    expect(parsed.dark!.unknown).toEqual([]);
  });

  it('exports the dark half resolved, not as a sparse diff', () => {
    // A designer opening the file should see the dark theme as it renders. A
    // half-empty dark block would make them fill in gaps the cascade already
    // fills.
    const file = themePairToFile({ surface: '#ffffff', ink: '#111827' }, { surface: '#0b1220' });
    expect(file.dark.surface).toBe('#0b1220');
    expect(file.dark.ink).toBe('#111827');
  });

  it('still accepts every single-theme shape that worked before', () => {
    // Our old flat export, W3C tokens and a CSS paste must keep landing on the
    // variant being edited — a designer may already hold one of these files.
    for (const text of [
      JSON.stringify({ accent: '#0f7b5a' }),
      JSON.stringify({ color: { accent: { $value: '#0f7b5a' } } }),
      ':root { --site-accent: #0f7b5a; }',
    ]) {
      const parsed = parseDesignFile(text);
      expect(parsed.single?.theme.accent, text).toBe('#0f7b5a');
      expect(parsed.light).toBeUndefined();
      expect(parsed.dark).toBeUndefined();
    }
  });

  it('accepts a file naming only one variant', () => {
    const parsed = parseDesignFile(JSON.stringify({ dark: { accent: '#7dd3fc' } }));
    expect(parsed.dark!.theme.accent).toBe('#7dd3fc');
    expect(parsed.light).toBeUndefined();
    expect(parsed.single).toBeUndefined();
  });

  it('does not mistake a design-token group named light for a variant', () => {
    // `{ light: {...}, color: {...} }` is a token file with a group that
    // happens to be called light. Reading it as a variant pair would apply a
    // designer's palette to the wrong half.
    const parsed = parseDesignFile(
      JSON.stringify({ light: { accent: '#0f7b5a' }, color: { ink: '#111827' } })
    );
    expect(parsed.single).toBeDefined();
    expect(parsed.light).toBeUndefined();
  });

  it('refuses a colour it cannot convert rather than guessing', () => {
    // rgb()/named colours are reported, not half-converted: a wrong brand
    // colour is worse than a rejected one.
    const parsed = parseDesignFile(JSON.stringify({ light: { accent: 'rgb(15,123,90)' } }));
    expect(parsed.light!.theme.accent).toBeUndefined();
    expect(parsed.light!.invalid.map((i) => i.name)).toContain('accent');
  });
});

describe("the visitor's own choice", () => {
  it('overrides the site default', () => {
    expect(effectiveMode('dark', 'light')).toBe('dark');
    expect(effectiveMode('light', 'dark')).toBe('light');
  });

  it('falls back to the site default when absent', () => {
    expect(effectiveMode(undefined, 'auto')).toBe('auto');
    expect(effectiveMode(null, 'dark')).toBe('dark');
  });

  it('ignores a value it does not recognise', () => {
    // A tampered or stale cookie must degrade to the site's setting rather
    // than stamping something that matches no selector and pins everyone to
    // light.
    for (const bad of ['auto', 'DARK', 'true', '', 'system', '<script>']) {
      expect(effectiveMode(bad, 'auto'), bad).toBe('auto');
    }
    expect(parseVisitorMode('auto')).toBeNull();
  });
});
