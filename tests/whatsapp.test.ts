// tests/whatsapp.test.ts
import { describe, it, expect } from 'vitest';
import { waNumber, whatsappLink, productEnquiry } from '@/lib/commerce/whatsapp';

describe('waNumber', () => {
  it('turns what a shop owner types into what wa.me needs', () => {
    // Digits alone are not routable — wa.me needs the country code, and
    // "079 123 4567" does not carry one until it is parsed.
    for (const typed of ['0791234567', '079 123 4567', '+962 79 123 4567', '00962791234567']) {
      expect(waNumber(typed), typed).toBe('962791234567');
    }
  });

  it('drops the plus, which wa.me does not accept', () => {
    expect(waNumber('+962791234567')).not.toContain('+');
  });

  it('respects the store country for a bare local number', () => {
    expect(waNumber('07912345678', 'GB')).toBe('447912345678');
  });

  it('returns null rather than a link that opens an error', () => {
    for (const bad of ['', '   ', 'call us', '123', null, undefined]) {
      expect(waNumber(bad as string), String(bad)).toBeNull();
    }
  });
});

describe('whatsappLink', () => {
  it('builds a bare link when there is no message', () => {
    expect(whatsappLink({ phone: '0791234567' })).toBe('https://wa.me/962791234567');
  });

  it('encodes spaces as %20, not +', () => {
    /**
     * URLSearchParams would write `+` for a space, and WhatsApp shows that
     * literally — the shopper's opening message arrives full of plus signs.
     */
    const url = whatsappLink({ phone: '0791234567', message: 'Hello there' })!;
    expect(url).toContain('text=Hello%20there');
    expect(url).not.toContain('+there');
  });

  it('survives Arabic and newlines', () => {
    const url = whatsappLink({ phone: '0791234567', message: 'مرحباً\nسؤال' })!;
    expect(url).toContain('%0A');
    expect(decodeURIComponent(url.split('text=')[1]!)).toBe('مرحباً\nسؤال');
  });

  it('is null when the number is unusable, so the button can be hidden', () => {
    expect(whatsappLink({ phone: null })).toBeNull();
    expect(whatsappLink({ phone: 'not a phone' })).toBeNull();
  });
});

describe('productEnquiry', () => {
  const product = { name: 'Lulu Drawer Package', sku: 'JM-PKG-01', url: 'https://x.test/en/products/jm-pkg-01' };

  it('names the product, its SKU and its URL', () => {
    // Whoever answers has fifty near-identical packages; "is this in stock?"
    // with no reference costs two more messages to resolve.
    const text = productEnquiry('en', product);
    expect(text).toContain('Lulu Drawer Package');
    expect(text).toContain('JM-PKG-01');
    expect(text).toContain(product.url);
  });

  it('writes in the shopper’s language', () => {
    expect(productEnquiry('ar', product)).toContain('أود الاستفسار عن');
    expect(productEnquiry('en', product)).toContain("I'd like to ask about");
  });

  it('copes with a product that has no SKU', () => {
    const text = productEnquiry('en', { name: 'Amber Oud', url: 'https://x.test/p' });
    expect(text).toContain('Amber Oud');
    expect(text).not.toContain('()');
  });
});
