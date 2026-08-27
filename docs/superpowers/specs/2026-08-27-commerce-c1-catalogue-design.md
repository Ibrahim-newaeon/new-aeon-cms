# Commerce C1 — Catalogue

**Date:** 2026-08-27
**Status:** Design, awaiting review
**Part of:** Commerce module (C0 Email · **C1 Catalogue** · C2 Cart & Checkout · C3 Order management · C4 Engagement)

---

## 1. Purpose

Make products manageable in the admin and browsable on the public site. Nothing
is purchasable at the end of C1 — no cart, no orders. A visitor can find a
product and see its price, variants and images; an editor can create and
maintain the catalogue.

C1 is the foundation the other three commerce phases build on, so its job is to
get the **data model** right. Cart and checkout inherit whatever variant model
this phase lands on.

### Success criteria

- An editor can create a product with translations, images, variants and a price
  without touching the database.
- A visitor can browse `/[locale]/shop`, filter by category, and open a product.
- The existing `product-grid` block renders real products.
- Switching the store currency in Settings displays correct prices.

---

## 2. Scope decisions already made

| Decision | Consequence |
|---|---|
| Store is **generic**, not a specific vertical | Variant attributes must be author-defined, not fixed columns |
| Device-compatibility module is **out** | `deviceBrands`, `deviceModels`, `productCompat` are never built |
| COD now, gateway later | No effect on C1; matters in C2 |
| Customers are records, no login | No effect on C1 |

---

## 3. Non-goals

Explicitly **not** in C1, to stop scope drifting:

- Cart, checkout, orders, customers (C2/C3)
- Reviews, stock alerts (C4)
- Coupons, shipping zones (C2 — both exist to compute an order total)
- Bundles (`bundles`, `bundleItems` stay unbuilt; no current requirement)
- Inventory *decrementing* — C1 stores a stock number and displays
  "out of stock", but nothing consumes it until there are orders
- Faceted attribute filtering on the storefront (category filter only)

---

## 4. Schema changes

All commerce tables are currently **empty (0 rows)**, so every change below is a
clean migration with no data to preserve.

### 4.1 Generic variant attributes — the central change

`productVariants` currently hardcodes four attribute columns:

```
color, size, capacity, connector_type
```

`capacity` and `connectorType` are phone-accessory fields. For a generic store
they are dead weight, and any store that needs a fifth axis (material, scent
concentration, length) cannot express it.

**Replace with a two-table option model**, the same shape Shopify and
WooCommerce use:

```
product_options            -- the axes a product varies on
  id, product_id, name, position
  unique (product_id, name)

variant_option_values      -- one value per axis, per variant
  variant_id, option_id, value
  primary key (variant_id, option_id)
```

A perfume product declares options `Size` and `Colour`; each variant supplies
`50ml` / `Gold`. The storefront selector is generated from the options rather
than hardcoded, and adding an axis needs no migration.

**Why not a `jsonb` blob on the variant?** Simpler to write, but the storefront
needs to render one selector per axis in a stable order, and later phases need
to filter by value. A blob makes both awkward and makes it impossible to
guarantee every variant of a product covers the same axes.

**Why not full EAV** (`attributes` + `attribute_values` tables shared across
products)? It buys global attribute reuse we have no requirement for, at the
cost of two more joins on every product page.

**Columns dropped:** `color`, `size`, `capacity`, `connector_type`.
**Columns kept:** `sku`, `barcode`, `price`, `compareAtPrice`, `stock`,
`lowStockThreshold`, `weightGrams`, `isActive`.

### 4.2 Domain leftovers on `products`

`warrantyMonths` and `isGenuine` are electronics fields ("genuine" meaning
not counterfeit). A generic catalogue should not carry them as columns.

**Both are dropped.** `productSpecs` already exists as a per-locale key/value
table and expresses either one as a spec row — which also makes them
translatable, which columns are not.

### 4.3 Product ↔ category

`products.categoryId` is a single FK, while content uses a many-to-many
`content_categories` join table.

**Left as-is.** The inconsistency is real but there is no requirement for a
product in two categories, and changing it costs a table plus UI for no present
benefit. Recorded here so the next person does not think it was an oversight.

### 4.4 Migration

One migration: drop four columns from `product_variants`, drop two from
`products`, create `product_options` and `variant_option_values`.

---

## 5. Price handling — a bug fixed in this phase

`lib/utils.ts` currently does:

```ts
const decimal = amount / 1000;
new Intl.NumberFormat('ar-SA', { currency, minimumFractionDigits: 3 })
```

Prices are stored as integers in the currency's minor unit. `/1000` and three
decimals are correct for **JOD only** (1 dinar = 1000 fils). Currency is
user-configurable in Settings, so a store set to `USD` or `SAR` — two decimal
places, minor unit of 100 — renders `12900` as **`$12.900` instead of
`$129.00`**: a tenth of the real price. On a live store that is selling at 90%
off. The locale is also pinned to `ar-SA` regardless of the page.

**Fix in C1**, because C1 is where prices first reach a visitor:

- Look the minor-unit exponent up from the currency code (3 for JOD/KWD/BHD/OMR,
  0 for JPY, 2 for everything else in likely use).
- Take the display locale from the page, not a constant.
- Keep integer storage — floating-point money is a worse bug than this one.

---

## 6. Admin surface

Route base: `/admin/commerce/products` (the sidebar already links here and
currently renders a placeholder).

**Products list** — reuses `DataTable`: name, SKU count, price, stock, status,
search, edit, delete. Same shape as the Pages list.

**Product editor** — one page, locale tabs for translatable fields, mirroring
the existing content editor:

- *Details*: slug, brand, category, base price, compare-at price, active,
  sort order
- *Translations* (per locale): name, short description, description, meta title,
  meta description
- *Images*: reuses the **media library picker** built in the media phase —
  ordered, with alt text
- *Options & variants*: declare option axes, then a variant row per combination
  with SKU, price, stock
- *Specs*: per-locale key/value rows

**Brands** — a small manager at `/admin/commerce/brands`, same pattern as Tags:
slug, name, logo (media picker), active. Brands are not translatable today and
that is left alone.

### Permissions

Products follow content rules: `admin` and `editor` may write, `author` may not
(a catalogue is not authored content). Read requires any admin session.

---

## 7. Storefront surface

| Route | Purpose |
|---|---|
| `/[locale]/shop` | All active products, newest first, category filter |
| `/[locale]/shop/[categorySlug]` | Products in one category |
| `/[locale]/products/[slug]` | Product detail |

`/[locale]/products/[slug]` is fixed by the existing `product-grid` block, which
already links there — the route must match rather than the block being changed.

**One taxonomy, two views.** Products and content share the same `categories`
table, so a category may hold both articles and products. `/[locale]/category/x`
lists articles in category *x*; `/[locale]/shop/x` lists products in the same
category. That is intentional — one taxonomy the editor maintains once — but it
means a category page never shows both together. If a combined view is ever
wanted, it belongs on `/[locale]/category/x`, not in the shop.

**Product detail** shows: image gallery, name, description, price
(with compare-at struck through when higher), a selector per option axis, stock
state, and specs. With no cart in C1, the primary action is a **contact/enquire**
link pointing at the existing contact form.

**Every storefront route is gated on `settings.eCommerceEnabled`** and returns
`notFound()` when commerce is off — consistent with `ProductGridBlock`, which
already checks the flag before querying. Otherwise disabling the module would
leave the shop reachable by URL.

**Translations follow the content pattern:** an `innerJoin` on `productI18n`, so
a product with no translation for the current locale is omitted rather than
rendered nameless.

---

## 8. Reuse

C1 introduces no new patterns. It reuses:

| Existing piece | Used for |
|---|---|
| `MediaField` / `MediaPickerDialog` | Product images, brand logos |
| `DataTable` | Products and brands lists |
| `requireApiAuth` | Every mutating endpoint |
| Locale-tab editor pattern | Product translations |
| `ArchiveList` shape | Shop listing cards |
| Zod-schema-per-feature | `lib/commerce-schema.ts` |

---

## 9. Error handling

- **Duplicate slug or SKU** — checked before insert, returns `409` with a
  field-level message rather than a constraint-violation `500`. Same approach as
  categories and tags.
- **Deleting a brand or category still referenced by products** — refused with
  `409`. `products.brandId` and `products.categoryId` carry no `ON DELETE` rule,
  so deleting would leave rows pointing at missing UUIDs.
- **Variant combination collision** — a product cannot have two variants with
  the same set of option values; enforced at the API and surfaced in the editor.
- **Product with no variants** — permitted. `products.basePrice` is the price;
  variants are optional refinement.
- **Image URLs** — validated with the same scheme allow-list used elsewhere
  (`http(s)` or site-relative), blocking `javascript:` and `data:`.

---

## 10. Testing

The project has **no test framework installed** — this is recorded in the build
ledger as an open item and is not introduced by C1.

C1 will be verified the way every phase in this session has been: typecheck,
production build, then exercising each path against the running app and the real
database. Specifically:

- Create a product with two option axes and four variants; confirm rows land in
  `product_options` and `variant_option_values`.
- Confirm duplicate slug and duplicate variant-combination both return `409`.
- Confirm a product with no translation for a locale is absent from that
  locale's shop listing.
- Confirm every storefront route 404s when `eCommerceEnabled` is off.
- Confirm prices render correctly with the currency set to JOD **and** to USD —
  the regression the price fix exists to prevent.

---

## 11. Open questions

None blocking. Two things deliberately deferred rather than decided:

1. **Brand translation** — brands carry a single `name`. Same limitation as
   tags. Revisit if a brand ever needs a different name per locale.
2. **Product ↔ category cardinality** — single category per product, per §4.3.

---

## 12. Definition of done

- [ ] Migration applied: generic option tables in, dead columns out
- [ ] `formatPrice` correct for JOD, USD and SAR, with page locale
- [ ] Products admin: list, create, edit, delete, with images and variants
- [ ] Brands admin: list, create, edit, delete
- [ ] `/[locale]/shop`, `/[locale]/shop/[category]`, `/[locale]/products/[slug]`
- [ ] All storefront routes 404 when commerce is disabled
- [ ] `product-grid` block renders real products
- [ ] Typecheck clean, production build passes
- [ ] Build ledger updated
