# Clearing the remaining backlog

**Date:** 2026-08-29
**Status:** In progress
**Covers:** the six items left on the build ledger after the hardening run.

Taken in value order, not ledger order. Each ships and is verified on its own.

---

## 1. Self-service password reset

**Now** — an admin can set anyone's password from the panel; there is no email
flow. If the only admin account is lost, recovery is a database query.

**Design.** A `password_reset_tokens` table holding a **hash** of the token, not
the token — a leaked database dump must not be a set of working reset links,
which is the same reasoning that applies to `users.password_hash`.

- Request: `POST /api/auth/forgot` takes an email, always answers 200. Telling
  an anonymous caller whether an address exists turns the form into the
  user-enumeration oracle the login endpoint deliberately is not.
- Rate limited on the same limiter as login. Without it this becomes a free
  email-sending relay pointed at any address the attacker likes.
- Tokens are single-use, expire in 60 minutes, and are invalidated in bulk when
  used. Consuming one **revokes every refresh token** for that user: if the
  reset was triggered by a compromise, leaving the attacker's session alive
  defeats the point.
- Reset: `POST /api/auth/reset` verifies hash + expiry + unused, then sets the
  password.
- An inactive user gets the same silent 200 and no email.

**Not doing:** security questions, SMS. Out of scope and worse.

---

## 2. Split newsletter from messages

**Now** — both types render mixed in one list at `/admin/forms`.

**Design.** No schema change; `form_submissions.type` already separates them.
Two tabs over the same table, because they are different jobs:

- **Messages** — a queue. Read/unread state, marked read on open, archivable.
  `is_read` exists and was never written to.
- **Newsletter** — a list. Deduplicated by email, exported as CSV.

CSV export is a route, not a client-side blob: the browser sandbox in some
contexts blocks script-driven downloads, and a plain `Content-Disposition`
response works everywhere. Escaped against CSV injection — a value starting
`=`, `+`, `-` or `@` is a formula to Excel, and these values come from a public
unauthenticated form.

---

## 3. Orphan media cleanup

**Now** — deleting a page never frees its images, and nothing shows which
uploads are unused.

**Design.** A filter in the media library, **not** automatic deletion on
content delete. One image can be referenced by many pages, by settings, by a
product; deciding "unused" at delete time means racing every other reference.
Computing it on demand is both safer and honest about being a snapshot.

An asset is unused when its URL appears in none of: `content.featured_image`,
`content_i18n.body`, `settings` (logo/favicon), `product_images.url`,
`brands.logo`. Deletion stays the explicit, per-asset action it already is,
plus a "select all unused" affordance.

---

## 4. Dashboard trends

**Now** — real statistics, no trend indicators. They were removed rather than
left showing invented numbers, which was right.

**Design.** Compare the last 30 days against the 30 before it, from
`created_at`. Show the delta only when the previous period is non-zero — "+100%"
against a base of zero is noise, not information. No sparklines; a number and a
direction is the honest amount of signal available from this data.

---

## 5. Media folders

**Now** — table, self-reference and `media_assets.folder_id` all exist and are
all empty.

**Design.** One level of nesting, matching categories. A folder tree beside the
grid, assets filtered by selection, and a move action. Deleting a folder moves
its assets to the root rather than deleting them — a folder is an organising
device and must never be a way to lose files by accident.

`media_folders.path` is maintained as a denormalised breadcrumb for display.

---

## 6. C4 — reviews, bundles, stock alerts

The largest piece, and three separate features. Tables do not exist.

**Reviews.** `product_reviews`, moderated: a review is `pending` until an admin
approves it, because an unmoderated public write endpoint on a storefront is a
spam target. Rating 1–5, one review per (product, phone) so the same
normalisation that merges customers stops trivial repeat-posting. Aggregate
rating is computed, not stored — a denormalised average that drifts is worse
than a join.

**Bundles.** `product_bundles` + `bundle_items`. A bundle prices as a fixed
total, not a computed discount, so a later price change to a component cannot
silently alter what a bundle costs. Adding a bundle to the cart adds its
components as ordinary lines — otherwise every downstream thing (stock
decrement, order items, fulfilment) needs a second code path.

**Stock alerts.** `stock_alerts` — a shopper leaves an email against an
out-of-stock variant and is notified when it returns. The notification fires
from the one place stock rises: the C3 cancel/refund restore, and any admin
stock edit. Uses C0's mail transport.

---

## Verification

Each item ships with unit tests where the logic is pure, browser tests where the
flow crosses screens, and a real run against the dev database. Nothing is
marked done on the ledger before its tests are green.
