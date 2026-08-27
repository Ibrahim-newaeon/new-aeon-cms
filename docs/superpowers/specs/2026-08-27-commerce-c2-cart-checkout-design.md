# Commerce C2 — Cart & Checkout

**Date:** 2026-08-27
**Status:** Complete
**Part of:** Commerce module (C0 Email · C1 Catalogue ✅ · **C2 Cart & Checkout ✅** · C3 Order management · C4 Engagement)

---

## 1. Purpose

Turn the C1 catalogue into a shop: a visitor can add variants to a cart, enter
delivery details, and place a cash-on-delivery order. The order is recorded
against a customer, stock is decremented, and shipping and any coupon are
applied.

C3 (order management) reads what this phase writes, so the **order data model**
is the part that has to be right. Getting the status machine and the customer
link wrong here means reshaping them later with live orders in the table.

### Success criteria

- A visitor can go from a product page to a placed order without an account.
- The order total is computed on the server and cannot be altered by the client.
- Stock cannot go negative.
- The same phone number placing two orders produces **one** customer with two
  orders.
- Adding a payment gateway later requires no change to the orders schema.

---

## 2. Decisions already made

| Decision | Consequence |
|---|---|
| **Cart in a signed cookie**, no server record | No `carts` table, no cleanup job, no cookie/server merge path |
| **Stock re-checked at order placement**, reject if short | No reservations, no expiry job. A late order can fail |
| COD now, gateway later | Status enums must anticipate authorise/capture/refund |
| Customers are records, no login | No storefront auth; customer rows are created by checkout |
| Shipping zones and coupons live here | Both exist only to compute a total |

---

## 3. Non-goals

- Storefront accounts, login, or order-history pages for shoppers (never — see
  the customers decision)
- Online payment capture (a later phase; the model must not block it)
- Admin order screens — listing, filtering, fulfilment (**C3**)
- Order confirmation email (**C0** — orders are placed silently until then)
- Reviews, stock alerts (**C4**)
- Bundles, back-orders, partial fulfilment, multi-currency carts

---

## 4. The cart

### 4.1 Storage

A cookie named `cart`, containing only `[{ variantId, qty }]` — **no prices, no
names**.

The cookie is **signed** (HMAC via `jose`, reusing the existing JWT secret
infrastructure) so a visitor cannot hand-edit it into a different shape. But
signing is not what protects the price: prices are never in the cookie at all.

**Everything displayed and charged is re-read from the database on each request.**
A cart cookie from last week shows today's price, and a product deleted since
then simply drops out of the cart with a notice.

Cookie limits: ~4KB, so roughly 30 distinct lines. The cart caps at **20 lines**
with a clear message, well inside the limit.

### 4.2 Behaviour

- Add to cart from the product page — the option selector becomes interactive,
  which it deliberately was not in C1.
- Quantity is clamped to `1..99` per line and to available stock at display time.
- A line whose variant is inactive, deleted, or out of stock is shown as
  unavailable and excluded from the total rather than silently vanishing.

---

## 5. Schema changes

### 5.1 `customers` (new)

```
customers
  id, phone (unique), name, email, governorate, city,
  address_line, landmark, notes, created_at, updated_at
```

**Keyed on phone, not email.** This is a cash-on-delivery shop in Jordan: the
courier calls the phone number, and email is frequently not given. Phone is the
one field guaranteed present, so it is the natural identity.

Phone is normalised before lookup — strip spaces, dashes and a leading `+962`
or `00962` to a canonical `07XXXXXXXX` — otherwise `+962 7 9123 4567` and
`079 123 4567` become two customers for one person.

Checkout **upserts** on the normalised phone: existing customer gets their
details refreshed, new one is created. That is how "the same person, two orders"
resolves to one record.

### 5.2 `shipping_zones` (new)

```
shipping_zones
  id, name, governorates (jsonb array), flat_rate,
  free_over (nullable), eta_days, is_active, sort_order
```

Checkout matches the chosen governorate against the zones. **No match is an
error, not a free delivery** — a mis-typed governorate must not silently ship for
nothing. If no zone covers the address, checkout refuses with a message asking
the customer to contact the store.

`free_over` compares against the **subtotal after discount**, so a coupon does
not accidentally unlock free shipping the store did not intend.

### 5.3 `coupons` (new)

```
coupons
  id, code (unique, uppercase), type ('percent' | 'fixed'),
  value, min_subtotal, usage_limit (nullable), used_count,
  starts_at, ends_at, is_active, created_at
```

Validated server-side at placement, never trusted from the client. A percent
coupon is capped so a discount can never exceed the subtotal, and a fixed coupon
is clamped to the subtotal — a negative order total must be impossible.

`used_count` increments **inside the order transaction**, so two people
redeeming the last use of a limited coupon cannot both succeed.

### 5.4 `orders` (existing — modified)

| Change | Why |
|---|---|
| Add `customer_id` FK | Currently buyer details are loose columns with no record behind them |
| `status` varchar → **enum** | Today any typo creates a phantom status; `content.status` is already a proper enum |
| `payment_status` varchar → **enum** | Same, and the gateway phase depends on these values being closed |
| Add `shipping_zone_id` | Records which rate was applied, so a later rate change does not rewrite history |
| Add `coupon_code` snapshot (exists) + `discount` (exists) | Already present; now actually populated |

**Order status:** `pending → confirmed → processing → shipped → delivered`,
plus terminal `cancelled` and `refunded`.

**Payment status:** `pending → paid → refunded`, plus `failed` and `authorized`.
`authorized` and `failed` are unused by COD and exist **so the gateway phase adds
no migration** — the whole point of the "COD now, online later" decision.

### 5.5 `order_status_history` (new)

```
order_status_history
  id, order_id, from_status, to_status, note, changed_by, created_at
```

Answers "when did this ship, and who marked it?". C3 writes to it from the admin;
C2 writes the initial `→ pending` row at placement.

### 5.6 Order numbers

Human-readable `ORD-1001`, from a Postgres sequence starting at 1000. A
sequence, not `count(*) + 1`, which collides under concurrency.

---

## 6. Placing an order — the critical path

One database transaction. Everything below happens together or not at all:

1. Re-read every cart line's variant, price and stock **from the database**
2. Reject if any line is unavailable or short on stock, naming the item
3. Compute subtotal from database prices
4. Validate and apply the coupon; clamp so the total cannot go negative
5. Match the governorate to a shipping zone; apply `free_over` against the
   discounted subtotal
6. Upsert the customer on normalised phone
7. Insert `orders` + `order_items`, **snapshotting name, SKU and price** so
   later catalogue edits never rewrite order history
8. Decrement variant stock
9. Increment `coupons.used_count`
10. Insert the initial `order_status_history` row
11. Clear the cart cookie

**The client sends only `{ variantId, qty }`, an address, and a coupon code.**
It never sends a price, a subtotal, or a total. Any total arriving from the
browser is ignored — this is the single most important property of the phase.

### Idempotency

A double-submitted form must not create two orders. Checkout carries a
one-time token; a repeated submission with a spent token returns the existing
order rather than creating another.

---

## 7. Storefront surface

| Route | Purpose |
|---|---|
| `/[locale]/cart` | Review lines, change quantity, remove, see the subtotal |
| `/[locale]/checkout` | Address form, shipping estimate, coupon, place order |
| `/[locale]/order/[orderNumber]` | Confirmation — what was ordered, what it cost |

The confirmation page is reachable by order number alone. That is a deliberate
trade-off for a guest-checkout store: the number is high-entropy enough not to be
guessable in bulk, and requiring a login would defeat the point of guest
checkout. It shows **no phone or full address** — only the order contents,
totals and status — so a leaked link exposes nothing personal.

All three routes 404 when `eCommerceEnabled` is off, matching C1.

---

## 8. Admin surface

C2 adds only what feeds checkout; order screens are C3.

- `/admin/commerce/shipping` — zones: name, governorates, rate, free-over, ETA
- `/admin/commerce/coupons` — codes: type, value, limits, date window, usage

Both follow the Tags/Brands manager pattern. Both are `admin`/`editor` only.

---

## 9. Error handling

| Case | Behaviour |
|---|---|
| Variant out of stock at placement | `409`, names the item, cart preserved |
| Variant deleted or deactivated | Line marked unavailable, excluded from total |
| No shipping zone matches | `400`, asks the customer to make contact — never free |
| Coupon invalid, expired, or limit reached | `400` with the specific reason |
| Coupon below `min_subtotal` | `400` stating the threshold |
| Malformed or tampered cart cookie | Treated as empty, cookie cleared |
| Double submit | Returns the existing order, no duplicate |

---

## 10. Testing

Verified the way every phase has been — typecheck, build, then exercised against
the running app and real database:

- Place an order; confirm stock decrements by exactly the ordered quantity.
- Order the last unit twice; confirm the second returns `409` and stock never
  goes negative.
- Send a forged total in the request body; confirm the stored total is computed
  from database prices and the forged value is ignored.
- Place two orders with `+962 79 123 4567` and `079 123 4567`; confirm **one**
  customer row with two orders.
- Apply a coupon worth more than the subtotal; confirm the total floors at the
  shipping cost, never negative.
- Submit an address in a governorate no zone covers; confirm `400`, not free
  shipping.
- Submit the same checkout token twice; confirm one order.

---

## 11. Defects found while verifying

Recorded because each was found by running the code, not by reading it.

1. **The checkout token length bound rejected every order.** `token:
   z.string().max(128)` was written when the token was a UUID. Replacing it with
   a signed JWT (~200 characters) made the schema reject every submission with a
   400 before `placeOrder` was ever called — no order could be placed at all.
   Bound widened to 1024.
2. **"Your cart is empty" masked "this item just sold out."** `itemCount` counts
   only *available* units, so a cart whose sole line went out of stock reported
   zero and hit the `EMPTY_CART` branch first. The `UNAVAILABLE` check now runs
   before the empty check, and the customer gets 409 with the item named.
3. **Cart lines fell back to the URL slug.** A product translated in one locale
   but not the current one showed `amber-oud` where a name belonged. The cart now
   falls back to any other locale's name, then the SKU — never the slug. This does
   not contradict C1's decision to hide untranslated products from the catalogue:
   the catalogue may omit a product, but the cart must never obscure a line the
   customer has already added.

---

## 12. Open questions

1. **Tax/VAT** — not in the spec's schema and not requested. Assumed
   tax-inclusive pricing. Flag now if that is wrong; retrofitting tax onto
   existing orders is unpleasant.
2. **Governorate list** — hardcoded list of Jordan's 12 governorates, or a
   free-text field the zones match loosely? Recommending the fixed list, since
   free text makes zone matching unreliable.

---

## 13. Definition of done

- [x] Migration: `customers`, `shipping_zones`, `coupons`,
      `order_status_history`; orders status columns become enums
- [x] Cart cookie: signed, price-free, capped, re-priced on every read
- [x] `/cart`, `/checkout`, `/order/[orderNumber]`
- [x] Server-computed totals; client-supplied totals ignored
- [x] Stock decrement in-transaction; cannot go negative
- [x] Customer upsert on normalised phone
- [x] Shipping zone matching; unmatched governorate refuses
- [x] Coupon validation, clamping, and in-transaction usage increment
- [x] Idempotent submission
- [x] Shipping and coupon admin screens
- [x] All routes 404 when commerce is disabled
- [x] Typecheck clean, production build passes
- [x] Build ledger updated
