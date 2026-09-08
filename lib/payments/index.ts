// lib/payments/index.ts
import 'server-only';
import { isPaddleCurrency, paddleConfigured } from './paddle';

export type OnlinePaymentMethod = 'card' | 'wallet';
export type CheckoutPaymentMethod = 'cod' | OnlinePaymentMethod;

/**
 * Online card/wallet when Paddle secrets are set AND the store currency is on
 * Paddle's supported list. COD is always offered.
 */
export function onlinePaymentsEnabled(currency?: string): boolean {
  if (!paddleConfigured()) return false;
  if (currency !== undefined) return isPaddleCurrency(currency);
  return true;
}

export function isCheckoutPaymentMethod(
  value: string,
  onlineEnabled: boolean
): value is CheckoutPaymentMethod {
  if (value === 'cod') return true;
  if (!onlineEnabled) return false;
  return value === 'card' || value === 'wallet';
}

export {
  createPaddleCheckout,
  unmarshalPaddleEvent,
  paddleConfigured,
  isPaddleCurrency,
  PADDLE_CURRENCIES,
  EventName,
} from './paddle';
