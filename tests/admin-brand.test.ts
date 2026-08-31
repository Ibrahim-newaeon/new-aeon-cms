import { describe, it, expect } from 'vitest';
import { wordmark, adminBrandCss, accentInk, ADMIN_ACCENT_FALLBACK } from '@/lib/theme/admin-brand';
import { contrastRatio } from '@/lib/theme/import';

describe('the admin wordmark', () => {
  it('splits a name the way the original mark was split', () => {
    // "NEW / AEON" was hardcoded. The shape is kept; the identity is not.
    expect(wordmark('New Aeon')).toEqual({ lead: 'New', tail: 'Aeon' });
    expect(wordmark('Juman Lady')).toEqual({ lead: 'Juman', tail: 'Lady' });
  });

  it('puts a single-word name entirely in the accent', () => {
    expect(wordmark('Juman')).toEqual({ lead: '', tail: 'Juman' });
  });

  it('keeps a multi-word tail together', () => {
    expect(wordmark('Bab Al Yemen Perfumes')).toEqual({
      lead: 'Bab',
      tail: 'Al Yemen Perfumes',
    });
  });

  it('never renders an empty mark', () => {
    // A blank sidebar corner reads as a broken panel, not as an unset setting.
    for (const name of ['', '   ', '\n']) {
      expect(wordmark(name).tail, JSON.stringify(name)).toBeTruthy();
    }
  });

  it('caps a long name rather than letting it wrap into the navigation', () => {
    const { lead, tail } = wordmark('An Extremely Long Company Name That Keeps Going');
    expect(`${lead}${tail}`.length).toBeLessThanOrEqual(28);
  });
});

describe('the admin accent', () => {
  it('emits nothing for the default or an unset value', () => {
    // The common case must add no bytes to every admin page.
    expect(adminBrandCss(null)).toBe('');
    expect(adminBrandCss('')).toBe('');
    expect(adminBrandCss(ADMIN_ACCENT_FALLBACK)).toBe('');
    expect(adminBrandCss('#FFC619')).toBe('');
  });

  it('refuses anything that is not a six-digit hex', () => {
    // This string is interpolated into a <style> tag, so the guard is the
    // thing standing between a settings field and CSS injection.
    for (const bad of ['red', '#fff', 'rgb(1,2,3)', '#12345', 'x; } * { display:none']) {
      expect(adminBrandCss(bad), bad).toBe('');
    }
  });

  it('carries the aliases as well as the accent', () => {
    // Components still reference --admin-primary. A half-applied accent — new
    // buttons branded, older ones still yellow — is worse than none.
    const css = adminBrandCss('#0369a1');
    expect(css).toContain('--admin-accent:#0369a1');
    expect(css).toContain('--admin-primary:#0369a1');
    expect(css).toContain('--admin-accent-muted:rgb(3 105 161 / 0.15)');
  });

  it('gives the hover state a lighter shade of the same colour', () => {
    const css = adminBrandCss('#0369a1');
    const soft = /--admin-accent-soft:(#[0-9a-f]{6})/.exec(css)![1]!;
    expect(soft).not.toBe('#0369a1');
    // Lighter, not darker: the admin is a dark panel, so hover lifts.
    expect(contrastRatio(soft, '#000000')).toBeGreaterThan(contrastRatio('#0369a1', '#000000'));
  });

  it('picks readable text for whatever accent is chosen', () => {
    // The bug this replaces: #130c0e was hardcoded as the button text, which is
    // right on yellow and unreadable on navy. Every accent must clear AA.
    for (const accent of ['#ffc619', '#0369a1', '#111827', '#ffffff', '#7dd3fc', '#b91c1c']) {
      expect(contrastRatio(accentInk(accent), accent), accent).toBeGreaterThanOrEqual(4.5);
    }
  });
});
