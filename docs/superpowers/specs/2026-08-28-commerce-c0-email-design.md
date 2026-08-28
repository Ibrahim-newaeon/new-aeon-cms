# C0 — Transactional email

**Date:** 2026-08-28
**Status:** Complete
**Depends on:** nothing. Unblocks: order confirmations, contact-form alerts, and
any future password-reset flow.

## Problem

No mail package was installed at all — no nodemailer, resend or sendgrid. Two
things were silently broken as a result:

1. **Orders.** A customer completes checkout and gets an on-screen order number
   and nothing else. Since payment is cash-on-delivery there is no payment
   receipt either, so the order confirmation page is the *only* record they ever
   see, and it is gone the moment they close the tab.
2. **Contact forms.** `POST /api/forms` writes a row to `form_submissions` and
   returns 200. Nobody is notified. Submissions accumulate in a table that no
   admin screen reads, so in practice every enquiry is lost.

## Decision

### A driver, matching the storage module

```
lib/email/
  transport.ts   driver selection + delivery
  send.ts        sendMail() — the only entry point; never throws
  render.ts      bilingual RTL layout shell, money/date helpers
  templates/     order-confirmation, order-alert, form-alert
```

`MAIL_DRIVER=log | smtp | resend`, defaulting to **`log`**.

Defaulting to `log` is deliberate and is the single most important decision
here: a developer running the checkout flow locally must not be able to send a
real email to a real customer address sitting in their seed data. The log driver
prints the recipient, subject and a text rendering to stdout, and writes the
full HTML to `.mail-outbox/` so the markup can actually be inspected.

`smtp` covers essentially every provider (Gmail, Mailgun, SES, Postmark,
Migadu, a client's own server). `resend` is called over plain `fetch` rather
than its SDK — it is one POST, and the SDK is not worth a dependency.

### Sending must never fail the request that triggered it

`sendMail()` catches everything and returns `{ ok: boolean }`. Callers do not
await it in a way that can reject.

This matters most at checkout. By the time mail is sent the order is
**already committed** — stock is decremented, the coupon is consumed, the
customer row is upserted. Throwing there would return a 500 to someone whose
order genuinely exists and whose stock is genuinely gone, and whose retry would
be swallowed by the idempotency key. A bounced confirmation email is a far
smaller problem than an order the customer believes failed.

So: mail is sent **after** `placeOrder` returns and **outside** its transaction.
Never inside it — an SMTP round-trip inside a transaction holds row locks on
`product_variants` for the length of a network call.

### Who gets what

| Trigger | To | Template |
|---|---|---|
| Order placed | the customer, **if** they gave an email | `order-confirmation` |
| Order placed | the store | `order-alert` |
| Contact / newsletter form | the store | `form-alert` |

The customer's email is optional at checkout — this is a COD, phone-first store
and requiring an address to buy would cost real orders. So the customer
confirmation is conditional and the store alert is not.

The store address resolves in order: `MAIL_ADMIN_TO` env → `settings.contactEmail`
→ nothing (logged as a skipped send). Env first so a staging deploy cannot mail
the real shop by inheriting the production database.

`replyTo` on the store alert is set to the customer's address where there is
one, so replying from the mail client reaches the customer directly.

### Templates

Hand-written HTML, tables, inline styles. No MJML or React Email: this is three
templates, and mail clients need exactly the kind of markup a framework spends
its time hiding.

Bilingual and direction-aware. Arabic sets `dir="rtl"` on the container and
right-aligns; English sets `dir="ltr"`. Every template ships a plain-text
alternative — some clients show it, spam filters weigh its absence, and it is
what the `log` driver prints.

Money goes through the existing `formatPrice`, so the JOD 3-decimal handling and
the locale-correct digits are shared with the site rather than reimplemented.

### Locale

`orders` has no `locale` column, so the language is passed from the checkout
route, which has it. Adding a column was considered and rejected for now: the
only consumer that would need it is a future "resend confirmation" button, and
that can default to the store's own default locale. Flagged rather than built.

### Not in scope

- A retry queue or outbox table. A failed send is logged and dropped. Worth
  revisiting once there is a job runner; building a durable queue for three
  message types would be the larger mistake.
- Newsletter *content* — the form-alert covers the notification, not a mailing
  list integration.
- DKIM/SPF setup. Infrastructure, documented in `.env.example` rather than code.

## Verification

1. `log` driver — place an order, confirm both messages render and land in
   `.mail-outbox/`.
2. `smtp` driver against a local MailHog/Mailpit, confirm real SMTP delivery,
   headers, HTML and text parts.
3. Checkout with no customer email — store alert sent, confirmation skipped.
4. A transport that throws — order still returns 200 and the order exists.
5. Contact form submission produces a store alert.
