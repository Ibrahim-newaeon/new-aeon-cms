# Licensing New Aeon CMS

How the licence in `LICENSE` is meant to be sold. This is the commercial
counterpart to that file: `LICENSE` is the agreement, this is the shape of the
offer.

> Drafted by an engineer, not a lawyer. Have `LICENSE` reviewed by a Jordanian
> commercial lawyer before you issue it. The clauses most worth their time are
> 3(b) (multi-tenant use), 5 (agency and client work), 11 (liability cap) and
> 12 (governing law).

## The model

**One licence, one production Instance.** Staging, development and backup
copies are included — a client who needs a test environment should not need a
second licence to have one, and refusing that only teaches people to hide it.

**Source is delivered.** It has to be: the client self-hosts. That is not the
same as open source, and clause 3 is what carries the difference. The source
being visible is a feature you are selling (no lock-in, they can audit it, they
can extend it), not a right you have given away.

**Perpetual for the version supplied.** Support and updates are a separate
subscription. When that lapses, the site keeps running. A licence that switches
off a live shop is a licence nobody buys twice.

## Tiers

| | Single site | Agency | White-label |
| --- | --- | --- | --- |
| Production Instances | 1 | 1 per licence | 1 per licence |
| Source code | ✅ | ✅ | ✅ |
| Modify for own use | ✅ | ✅ | ✅ |
| Build for clients | — | ✅ | ✅ |
| Admin shows "Powered by New Aeon" | ✅ | ✅ | removed |
| Present it as your own product | — | — | ✅ |
| Resell or sublicense the software | — | — | — |

The last row is the same in every column on purpose. Nobody gets to become a
competing distributor; an agency gets to *build with it*, which is a different
thing and is what clause 5 grants.

## What is not licensed

Nothing here covers the client's own content, products, customers or orders.
That is theirs, clause 7 says so, and the export tools exist so the claim is
demonstrable rather than merely stated. "You can leave whenever you like" is
worth more as a sales line than any restriction is worth as a lock.

## Before issuing a licence

1. Put a real contact address at the foot of `LICENSE` — it currently says
   `<set a contact address here before issuing>`.
2. Confirm the Licensor name in clause 1 and the copyright line.
3. Re-run `npx tsx scripts/generate-notices.ts` so `THIRD-PARTY-NOTICES.md`
   matches what you are actually shipping.
4. Name the tier and the Instance on the invoice. `LICENSE` defers to it
   (clause 13), so the invoice is where "which tier" is recorded.

## Third-party obligations

`THIRD-PARTY-NOTICES.md` is generated from the installed tree and must travel
with the code. Three entries need more than attribution, and are called out in
that file:

- **libvips** (LGPL-3.0-or-later), the native image library behind `sharp`.
  Loaded dynamically and unmodified, which is the ordinary case and how a great
  many commercial products ship it. Do not statically link a modified build
  without advice.
- **caniuse-lite** (CC-BY-4.0), a build-time data set needing attribution.
- **argparse** (Python-2.0), permissive.

Everything else is MIT, ISC, BSD or Apache-2.0.

## A note on `"private": true`

`package.json` sets it, and it is worth understanding what it does and does not
do. It is a guard against an accidental `npm publish`. It is **not** a licence
and says nothing about what a client may do.

It is also not the first guard. On npm 11, `npm publish` in this repository
assembles the full tarball and stops at `ENEEDAUTH` without ever mentioning
`private` — it was the missing login that halted it, not the flag. Treat
`private` as one layer, and the licence as the thing that actually governs.
