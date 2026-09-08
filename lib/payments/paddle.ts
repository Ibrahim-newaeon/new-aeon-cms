// lib/payments/paddle.ts
import 'server-only';
import { Environment, EventName, Paddle, type CurrencyCode, type EventEntity } from '@paddle/paddle-node-sdk';
import { env } from '@/lib/env';

/**
 * Currencies Paddle Billing accepts. JOD / SAR / AED are NOT on this list —
 * online checkout stays hidden unless Settings → currency is one of these.
 */
export const PADDLE_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CLP', 'HKD', 'SGD', 'SEK',
  'ARS', 'BRL', 'CNY', 'COP', 'CZK', 'DKK', 'HUF', 'ILS', 'INR', 'KRW', 'MXN',
  'NOK', 'NZD', 'PEN', 'PLN', 'RUB', 'THB', 'TRY', 'TWD', 'UAH', 'VND', 'ZAR',
] as const satisfies readonly CurrencyCode[];

const PADDLE_SET = new Set<string>(PADDLE_CURRENCIES);

let client: Paddle | null = null;

export function paddleConfigured(): boolean {
  return Boolean(env.PADDLE_API_KEY?.trim() && env.PADDLE_WEBHOOK_SECRET?.trim());
}

export function isPaddleCurrency(currency: string): currency is CurrencyCode {
  return PADDLE_SET.has(currency.toUpperCase());
}

export function getPaddle(): Paddle {
  if (!paddleConfigured()) {
    throw new Error('Paddle is not configured (PADDLE_API_KEY / PADDLE_WEBHOOK_SECRET)');
  }
  if (!client) {
    client = new Paddle(env.PADDLE_API_KEY!, {
      environment:
        env.PADDLE_ENV === 'production' ? Environment.production : Environment.sandbox,
    });
  }
  return client;
}

/**
 * Hosted Paddle Checkout for an already-placed order.
 *
 * Non-catalog one-time price so the charged amount is the server-computed
 * order total (minor units as a string). Tax mode `external` keeps the total
 * identical to what we showed at COD checkout — the shop owns tax, not Paddle.
 *
 * Card and digital wallets (Apple Pay / Google Pay / PayPal where enabled in
 * the Paddle dashboard) appear on the hosted page; we never touch card data.
 */
export async function createPaddleCheckout(input: {
  orderId: string;
  orderNumber: string;
  totalMinor: number;
  currency: string;
  customerEmail?: string | null;
  locale: 'ar' | 'en';
  /** Approved domain URL; Paddle appends ?_ptxn= and returns customers here. */
  returnUrl: string;
}): Promise<{ url: string; transactionId: string }> {
  if (!isPaddleCurrency(input.currency)) {
    throw new Error(
      `Currency ${input.currency} is not supported by Paddle. Switch Settings → currency to a Paddle currency (e.g. USD) or use COD.`
    );
  }

  const paddle = getPaddle();
  const currencyCode = input.currency.toUpperCase() as CurrencyCode;
  const amount = String(Math.max(0, Math.round(input.totalMinor)));

  const transaction = await paddle.transactions.create({
    currencyCode,
    collectionMode: 'automatic',
    customData: {
      orderId: input.orderId,
      orderNumber: input.orderNumber,
      locale: input.locale,
    },
    checkout: { url: input.returnUrl },
    items: [
      {
        quantity: 1,
        price: {
          description: `Order ${input.orderNumber}`,
          name: `Order ${input.orderNumber}`,
          taxMode: 'external',
          unitPrice: { amount, currencyCode },
          product: {
            name: `Order ${input.orderNumber}`,
            taxCategory: 'standard',
          },
        },
      },
    ],
  });

  const url = transaction.checkout?.url;
  if (!url) {
    throw new Error('Paddle transaction missing checkout.url');
  }

  return { url, transactionId: transaction.id };
}

export async function unmarshalPaddleEvent(
  rawBody: string,
  signature: string
): Promise<EventEntity> {
  return getPaddle().webhooks.unmarshal(rawBody, env.PADDLE_WEBHOOK_SECRET!, signature);
}

export { EventName };
