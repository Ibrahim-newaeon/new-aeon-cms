import { describe, it, expect, beforeAll } from 'vitest';
import { orderConfirmation, orderAlert, type OrderMailData } from '@/lib/email/templates/order';
import { orderStatusChanged } from '@/lib/email/templates/order-status';
import { formAlert } from '@/lib/email/templates/form';

beforeAll(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://shop.example.com';
});

function order(overrides: Partial<OrderMailData> = {}): OrderMailData {
  return {
    orderNumber: 'ORD-1000',
    locale: 'ar',
    currency: 'JOD',
    storeName: 'New Aeon',
    customerName: 'إبراهيم',
    phone: '0791234567',
    email: 'customer@example.test',
    governorate: 'amman',
    city: 'عمّان',
    addressLine: 'شارع الرينبو',
    landmark: null,
    notes: null,
    couponCode: null,
    items: [{ name: 'Amber Oud 50ml', sku: 'AO-50-G', qty: 2, unitPrice: 129000 }],
    subtotal: 258000,
    discount: 0,
    shipping: 3000,
    total: 261000,
    ...overrides,
  };
}

describe('order confirmation', () => {
  it('shows the order number, items and correctly formatted JOD total', () => {
    const mail = orderConfirmation(order({ locale: 'en' }));

    expect(mail.subject).toContain('ORD-1000');
    expect(mail.subject).toContain('New Aeon');
    expect(mail.html).toContain('Amber Oud 50ml');
    expect(mail.html).toContain('AO-50-G');
    // 261000 fils is 261 dinars — three decimals, not two.
    expect(mail.html).toContain('261.000');
  });

  it('links to the order page in the right locale', () => {
    expect(orderConfirmation(order({ locale: 'ar' })).html)
      .toContain('https://shop.example.com/ar/order/ORD-1000');
    expect(orderConfirmation(order({ locale: 'en' })).html)
      .toContain('https://shop.example.com/en/order/ORD-1000');
  });

  it('renders RTL for Arabic and LTR for English', () => {
    expect(orderConfirmation(order({ locale: 'ar' })).html).toContain('dir="rtl"');
    expect(orderConfirmation(order({ locale: 'en' })).html).toContain('dir="ltr"');
  });

  it('always ships a plain-text alternative', () => {
    // Some clients show it, spam filters weigh its absence, and the log driver
    // prints it.
    const mail = orderConfirmation(order());
    expect(mail.text.length).toBeGreaterThan(50);
    expect(mail.text).toContain('ORD-1000');
    expect(mail.text).not.toContain('<');
  });

  it('shows the discount row only when there is a discount', () => {
    expect(orderConfirmation(order()).html).not.toContain('الخصم');
    // Checked in English: the Arabic build renders Arabic-Indic digits, which
    // is correct but makes a Latin-digit assertion meaningless.
    const discounted = orderConfirmation(
      order({ locale: 'en', discount: 20000, couponCode: 'EID20' })
    );
    expect(discounted.html).toContain('EID20');
    expect(discounted.html).toContain('20.000');
  });

  it('renders Arabic-Indic digits in the Arabic mail', () => {
    expect(orderConfirmation(order({ locale: 'ar' })).html).toMatch(/[٠-٩]/);
  });

  it('escapes customer-controlled fields', () => {
    const mail = orderConfirmation(
      order({ customerName: '<script>alert(1)</script>', notes: '<img onerror=x>' })
    );
    expect(mail.html).not.toContain('<script>alert(1)');
    expect(mail.html).not.toContain('<img onerror');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('omits optional fields cleanly rather than printing null', () => {
    const html = orderConfirmation(order({ landmark: null, notes: null, email: null })).html;
    expect(html).not.toContain('null');
    expect(html).not.toContain('undefined');
  });
});

describe('order alert to the store', () => {
  it('sets Reply-To to the customer, so replying reaches them', () => {
    expect(orderAlert(order()).replyTo).toBe('customer@example.test');
  });

  it('leaves Reply-To unset when the customer gave no address', () => {
    expect(orderAlert(order({ email: null })).replyTo).toBeUndefined();
  });

  it('carries the full delivery address the shop needs to fulfil', () => {
    const html = orderAlert(order({ landmark: 'قرب الدوار الأول' })).html;
    expect(html).toContain('0791234567');
    expect(html).toContain('شارع الرينبو');
    expect(html).toContain('قرب الدوار الأول');
  });
});

describe('status change mail', () => {
  const base = {
    orderNumber: 'ORD-1000',
    currency: 'JOD',
    storeName: 'New Aeon',
    customerName: 'إبراهيم',
    total: 261000,
  } as const;

  it('uses a distinct headline per status', () => {
    const seen = new Set<string>();

    for (const status of ['confirmed', 'shipped', 'delivered', 'cancelled'] as const) {
      const mail = orderStatusChanged({ ...base, locale: 'en', status });
      expect(mail.text.length).toBeGreaterThan(20);
      seen.add(mail.text.split('\n')[0]!);
    }

    expect(seen.size).toBe(4);
  });

  it('escapes the admin note — a careless admin should not inject markup', () => {
    const mail = orderStatusChanged({
      ...base,
      locale: 'en',
      status: 'shipped',
      note: '<script>alert(1)</script>',
    });
    expect(mail.html).not.toContain('<script>alert(1)');
  });

  it('omits the note row when there is none', () => {
    const mail = orderStatusChanged({ ...base, locale: 'ar', status: 'confirmed' });
    expect(mail.html).not.toContain('null');
    expect(mail.html).not.toContain('undefined');
  });
});

describe('form alert', () => {
  const submittedAt = new Date('2026-08-28T12:00:00Z');

  it('humanises field keys the block editor produced', () => {
    // The shop owner should not have to read snake_case in their inbox.
    const mail = formAlert({
      type: 'contact',
      locale: 'en',
      fields: { full_name: 'Sara', phoneNumber: '079', 'e-mail': 'a@b.c' },
      submittedAt,
    });

    expect(mail.html).toContain('Full name');
    expect(mail.html).toContain('Phone Number');
    expect(mail.html).toContain('E mail');
  });

  it('sets no Reply-To even when a submitted email is present', () => {
    // The address is unverified; honouring it would let anyone redirect the
    // store's replies wherever they liked.
    const mail = formAlert({
      type: 'contact',
      locale: 'en',
      fields: { email: 'attacker@example.com' },
      submittedAt,
    });
    expect(mail.replyTo).toBeUndefined();
  });

  it('escapes every submitted value — this endpoint is public and unauthenticated', () => {
    const mail = formAlert({
      type: 'contact',
      locale: 'en',
      fields: { message: '<script>alert(1)</script>', '<b>key</b>': 'v' },
      submittedAt,
    });
    expect(mail.html).not.toContain('<script>alert(1)');
    expect(mail.html).not.toContain('<b>key</b>');
  });

  it('turns newlines in a message into line breaks', () => {
    const mail = formAlert({
      type: 'contact',
      locale: 'en',
      fields: { message: 'line one\nline two' },
      submittedAt,
    });
    expect(mail.html).toContain('line one<br>line two');
  });

  it('skips empty fields', () => {
    const mail = formAlert({
      type: 'contact',
      locale: 'en',
      fields: { name: 'Sara', empty: '', blank: '   ' },
      submittedAt,
    });
    expect(mail.html).toContain('Sara');
    expect(mail.html).not.toContain('Blank');
  });

  it('distinguishes a newsletter signup from a contact message', () => {
    const contact = formAlert({ type: 'contact', locale: 'en', fields: {}, submittedAt });
    const news = formAlert({ type: 'newsletter', locale: 'en', fields: {}, submittedAt });
    expect(contact.subject).not.toBe(news.subject);
  });
});
