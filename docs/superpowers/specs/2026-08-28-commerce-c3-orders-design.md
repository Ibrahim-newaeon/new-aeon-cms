# C3 — Order management

**Date:** 2026-08-28
**Status:** Complete
**Depends on:** C2 (orders exist), C0 (status-change email).

## Problem

`placeOrder` records orders correctly — items snapshotted, totals computed
server-side, status history seeded with `pending`. But `/admin/commerce/orders`
is an empty `SectionPlaceholder`, so **nothing can read or fulfil them**. The
store takes orders it cannot see.

Everything needed is already in the schema: `orders`, `order_items`,
`order_status_history`, `customers`, and an `order_status` enum with seven
values. C3 is the missing read/write surface, not new data.

## Decision

### Two screens plus one API route

```
app/(admin)/admin/commerce/orders/page.tsx        list, filtered server-side
app/(admin)/admin/commerce/orders/[id]/page.tsx   detail
app/api/commerce/orders/[id]/route.ts             PATCH: status, payment, note
components/admin/orders-table.tsx                 list client component
components/admin/order-detail.tsx                 detail client component
lib/commerce/order-status.ts                      the state machine
```

Filtering is done **server-side through searchParams**, not by shipping every
order to the browser and filtering in `useMemo` like `DataTable` does. That
pattern is fine for coupons and shipping zones, which are bounded sets an
editor curates. Orders grow without limit, and a shop with 20,000 of them
would send all 20,000 to the browser on every visit to the page.

### The state machine is the core of this

Status is not a free-form field. `lib/commerce/order-status.ts` defines which
transitions are legal:

```
pending    -> confirmed, cancelled
confirmed  -> processing, cancelled
processing -> shipped, cancelled
shipped    -> delivered, cancelled
delivered  -> refunded
cancelled  -> (terminal)
refunded   -> (terminal)
```

Enforced **server-side in the PATCH route**, not only by disabling buttons.
The UI offers legal transitions; the route rejects everything else. A dropdown
that lists all seven values and an API that accepts all seven would let a
mis-click move a delivered order back to pending and silently corrupt the
history trail.

### Cancelling restores stock — exactly once

This is the decision most likely to be got wrong. `placeOrder` decrements
`product_variants.stock` inside its transaction. If an order is cancelled and
the stock is not returned, the shop's inventory drifts down permanently and it
stops selling items it actually has.

So a transition **into** `cancelled` or `refunded` re-increments the stock for
every line, inside the same transaction as the status update. Correctness rests
on two things:

1. The transition guard makes `cancelled -> cancelled` illegal, so the restore
   cannot run twice.
2. The status update is written with `WHERE status = <the status we read>`.
   Two admins cancelling the same order concurrently both pass the guard, but
   only one matches that predicate; the loser's transaction restores nothing.

Without the second, the guard alone is a check-then-act race that double-restores
stock.

### Status history is append-only

Every transition writes an `order_status_history` row with `from`, `to`, an
optional note and `changedBy`. Nothing updates or deletes history. It is the
audit trail for a cash business, and the reason a dispute about what was
promised can be settled.

### Email on status change

Reuses C0. The customer is told when their order is **confirmed, shipped,
delivered or cancelled** — the transitions they care about. Internal moves
(`processing`) send nothing; a customer does not need to know the shop picked
their box off a shelf.

Conditional on a stored email, like the confirmation, and — same rule as
checkout — sent after the transaction commits and never able to fail the
request. An admin marking twenty orders shipped must not see a 500 because a
mail server was briefly down.

### No delete

Orders are financial records. The list has no delete action and the API exposes
no DELETE. `cancelled` is how an order stops being real, and it keeps the trail.

### Not in scope

- Editing order contents (adding a line, changing a quantity). It reopens
  pricing, stock and totals, and the shop's actual practice for a wrong order is
  to cancel and re-place. Would need its own spec.
- Printable invoices / packing slips. Worth doing; a separate piece of work.
- CSV export, bulk status changes, per-order refund amounts.

## Verification

1. The three real orders from C0 verification render in the list with correct
   totals and Arabic customer names.
2. Legal transition succeeds, writes history, sends the right email.
3. Illegal transition (delivered -> pending) is rejected by the API even when
   posted directly, bypassing the UI.
4. Cancelling restores stock; a second cancel is refused and does not
   double-restore.
5. Filters and search narrow the list server-side.
6. A non-admin role is refused.
