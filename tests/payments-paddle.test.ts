// tests/payments-paddle.test.ts
import { describe, it, expect } from 'vitest';
import {
  isCheckoutPaymentMethod,
  isPaddleCurrency,
  onlinePaymentsEnabled,
  PADDLE_CURRENCIES,
} from '@/lib/payments';

describe('Paddle currency gate', () => {
  it('accepts Paddle-supported codes', () => {
    expect(isPaddleCurrency('USD')).toBe(true);
    expect(isPaddleCurrency('eur')).toBe(true);
    expect(PADDLE_CURRENCIES).toContain('GBP');
  });

  it('rejects MENA codes Paddle does not list', () => {
    expect(isPaddleCurrency('JOD')).toBe(false);
    expect(isPaddleCurrency('SAR')).toBe(false);
    expect(isPaddleCurrency('AED')).toBe(false);
  });
});

describe('onlinePaymentsEnabled', () => {
  it('is false without Paddle secrets (default test env)', () => {
    expect(onlinePaymentsEnabled('USD')).toBe(false);
    expect(onlinePaymentsEnabled('JOD')).toBe(false);
  });
});

describe('isCheckoutPaymentMethod', () => {
  it('always allows COD', () => {
    expect(isCheckoutPaymentMethod('cod', false)).toBe(true);
    expect(isCheckoutPaymentMethod('cod', true)).toBe(true);
  });

  it('allows card/wallet only when online is enabled', () => {
    expect(isCheckoutPaymentMethod('card', true)).toBe(true);
    expect(isCheckoutPaymentMethod('wallet', true)).toBe(true);
    expect(isCheckoutPaymentMethod('card', false)).toBe(false);
    expect(isCheckoutPaymentMethod('wallet', false)).toBe(false);
    expect(isCheckoutPaymentMethod('bitcoin', true)).toBe(false);
  });
});
