# Online payments (Paddle)

COD is always available. Card / wallet appear at checkout only when:

1. `PADDLE_API_KEY` and `PADDLE_WEBHOOK_SECRET` are set
2. Settings → **currency** is on Paddle’s list (USD, EUR, GBP, …)

**Not supported by Paddle:** JOD, SAR, AED, EGP, and other MENA codes. Keep COD, or switch the store currency to a supported code before enabling online pay.

## Setup

1. Create a Paddle Billing sandbox (or live) account.
2. Create an API key; set `PADDLE_API_KEY` and `PADDLE_ENV=sandbox|production`.
3. Add a notification destination → `https://YOUR_DOMAIN/api/webhooks/paddle`.
4. Copy the destination secret → `PADDLE_WEBHOOK_SECRET`.
5. Subscribe at least to: `transaction.completed`, `transaction.paid`, `transaction.payment_failed`, `transaction.past_due`.
6. Approve your site origin (`NEXT_PUBLIC_APP_URL`) as a checkout / payment-link domain.
7. Enable PayPal / Apple Pay / Google Pay in the Paddle dashboard if you want wallets (they share the same hosted checkout as card).

## Flow

1. Customer places an order (server prices the cart; stock decrements).
2. For `card` / `wallet`, the API creates a Paddle transaction (non-catalog one-time price = order total) and returns `paymentUrl`.
3. Customer pays on Paddle’s hosted page.
4. Webhook sets `orders.payment_status` to `paid` or `failed`.
5. Customer returns to `/{locale}/order/{orderNumber}` (payment link `checkout.url`).

Tax mode is `external` so the charged amount matches the storefront total.

See `.env.example` and `docs/sales.md`.
