// lib/commerce/cart.ts
import 'server-only';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { db } from '@/lib/db';
import { products, productI18n, productImages, productVariants, productOptions, variantOptionValues, productBundles, bundleItems } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';

export const CART_COOKIE = 'cart';
export const MAX_LINES = 20;
const MAX_QTY = 99;

const SECRET = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET);

/**
 * The cookie holds ONLY variant ids and quantities.
 *
 * No prices, no names. Signing stops a visitor reshaping the payload, but the
 * reason a tampered cookie cannot change what they are charged is that the
 * price was never in it — every figure is re-read from the database on each
 * request. A month-old cart shows today's price.
 */
const cartCookieSchema = z.object({
  lines: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        qty: z.number().int().min(1).max(MAX_QTY),
        /**
         * Set when this line came from a bundle. Still an ordinary variant
         * line — stock, order items and fulfilment never learn that bundles
         * exist. Only pricing groups on it.
         */
        bundleId: z.string().uuid().optional(),
      })
    )
    .max(MAX_LINES),
});

export type CartCookie = z.infer<typeof cartCookieSchema>;

export interface CartLine {
  variantId: string;
  qty: number;
  /** Present when the line came from a bundle. */
  bundleId?: string;
  bundleName?: string;
  /** Present only when the variant still exists and is sellable. */
  available: boolean;
  reason?: 'missing' | 'inactive' | 'out_of_stock' | 'insufficient_stock';
  productSlug: string;
  name: string;
  optionSummary: string;
  sku: string;
  unitPrice: number;
  lineTotal: number;
  stock: number;
  image: string | null;
}

export interface CartView {
  lines: CartLine[];
  subtotal: number;
  itemCount: number;
  hasUnavailable: boolean;
  /**
   * What the bundles in this cart save against buying their parts separately.
   *
   * Expressed as a discount rather than by rewriting each line's price. A
   * bundle has ONE fixed price and its components have their own; splitting
   * that price back across lines cannot be done in integers without the line
   * totals ceasing to sum to the order total. Routing it through the discount
   * the schema already has keeps every figure exact and every downstream path
   * — stock, order items, fulfilment — completely unaware of bundles.
   */
  bundleDiscount: number;
  bundles: { id: string; name: string; saving: number }[];
}

async function encode(cart: CartCookie): Promise<string> {
  return new SignJWT({ ...cart })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .sign(SECRET);
}

async function decode(token: string | undefined): Promise<CartCookie> {
  if (!token) return { lines: [] };
  try {
    const { payload } = await jwtVerify(token, SECRET);
    const parsed = cartCookieSchema.safeParse(payload);
    return parsed.success ? parsed.data : { lines: [] };
  } catch {
    // Forged, expired-secret, or hand-edited: treat as empty rather than error.
    return { lines: [] };
  }
}

export async function readCartCookie(): Promise<CartCookie> {
  return decode((await cookies()).get(CART_COOKIE)?.value);
}

export async function writeCartCookie(cart: CartCookie): Promise<void> {
  const store = await cookies();
  if (cart.lines.length === 0) {
    store.delete(CART_COOKIE);
    return;
  }
  store.set(CART_COOKIE, await encode(cart), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearCart(): Promise<void> {
  (await cookies()).delete(CART_COOKIE);
}

/**
 * Prices the cart from the database. This is the only place a cart total is
 * ever produced — the client never supplies one.
 */
export async function priceCart(cart: CartCookie, locale: 'ar' | 'en'): Promise<CartView> {
  if (cart.lines.length === 0) {
    return {
      lines: [],
      subtotal: 0,
      itemCount: 0,
      hasUnavailable: false,
      bundleDiscount: 0,
      bundles: [],
    };
  }

  const ids = cart.lines.map((l) => l.variantId);

  const rows = await db
    .select({
      variantId: productVariants.id,
      sku: productVariants.sku,
      price: productVariants.price,
      stock: productVariants.stock,
      variantActive: productVariants.isActive,
      productId: products.id,
      productSlug: products.slug,
      productActive: products.isActive,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(inArray(productVariants.id, ids));

  const byVariant = new Map(rows.map((r) => [r.variantId, r]));

  // Names for EVERY locale, not just the requested one. A product translated
  // in English but not yet in Arabic should read "Amber Oud" to an Arabic
  // shopper — never "amber-oud", which is a URL, not a name.
  const names = rows.length
    ? await db
        .select({ productId: productI18n.productId, locale: productI18n.locale, name: productI18n.name })
        .from(productI18n)
        .where(inArray(productI18n.productId, [...new Set(rows.map((r) => r.productId))]))
    : [];

  const nameOf = new Map<string, string>();
  for (const row of names) {
    if (!row.name) continue;
    // Requested locale wins; otherwise first translation seen fills the gap.
    if (row.locale === locale || !nameOf.has(row.productId)) nameOf.set(row.productId, row.name);
  }

  // Option values, so a line reads "50ml · Gold" rather than a bare SKU.
  const values = await db
    .select({
      variantId: variantOptionValues.variantId,
      value: variantOptionValues.value,
      optionName: productOptions.name,
      position: productOptions.position,
    })
    .from(variantOptionValues)
    .innerJoin(productOptions, eq(productOptions.id, variantOptionValues.optionId))
    .where(inArray(variantOptionValues.variantId, ids));

  const images = rows.length
    ? await db
        .select({ productId: productImages.productId, url: productImages.url })
        .from(productImages)
        .where(inArray(productImages.productId, [...new Set(rows.map((r) => r.productId))]))
    : [];

  const firstImage = new Map<string, string>();
  for (const img of images) if (!firstImage.has(img.productId)) firstImage.set(img.productId, img.url);

  const lines: CartLine[] = cart.lines.map((line) => {
    const row = byVariant.get(line.variantId);

    const base = {
      variantId: line.variantId,
      qty: line.qty,
      productSlug: row?.productSlug ?? '',
      name: (row ? nameOf.get(row.productId) : undefined) ?? row?.sku ?? '',
      sku: row?.sku ?? '',
      optionSummary: values
        .filter((v) => v.variantId === line.variantId)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((v) => v.value)
        .join(' · '),
      unitPrice: row?.price ?? 0,
      lineTotal: 0,
      stock: row?.stock ?? 0,
      image: row ? firstImage.get(row.productId) ?? null : null,
    };

    // Unavailable lines stay VISIBLE but contribute nothing. Silently dropping
    // them would leave a buyer wondering what happened to their selection.
    if (!row) return { ...base, available: false, reason: 'missing' as const };
    if (!row.variantActive || !row.productActive) {
      return { ...base, available: false, reason: 'inactive' as const };
    }
    if ((row.stock ?? 0) <= 0) return { ...base, available: false, reason: 'out_of_stock' as const };
    if ((row.stock ?? 0) < line.qty) {
      return { ...base, available: false, reason: 'insufficient_stock' as const };
    }

    return { ...base, available: true, lineTotal: row.price * line.qty };
  });

  // Carry the bundle marker through so the cart can group and label lines.
  for (let i = 0; i < lines.length; i++) {
    const bundleId = cart.lines[i]?.bundleId;
    if (bundleId) lines[i]!.bundleId = bundleId;
  }

  const { bundleDiscount, bundles } = await priceBundles(lines);

  return {
    lines,
    subtotal: lines.reduce((sum, l) => sum + l.lineTotal, 0),
    itemCount: lines.filter((l) => l.available).reduce((n, l) => n + l.qty, 0),
    hasUnavailable: lines.some((l) => !l.available),
    bundleDiscount,
    bundles,
  };
}

/**
 * What each bundle in the cart saves against its parts.
 *
 * A bundle only counts when EVERY one of its lines is available: a partly
 * out-of-stock bundle is not the thing that was priced, and charging the bundle
 * price for fewer items would be wrong in the customer's favour one way and the
 * shop's the other.
 */
async function priceBundles(
  lines: CartLine[]
): Promise<{ bundleDiscount: number; bundles: { id: string; name: string; saving: number }[] }> {
  const ids = [...new Set(lines.map((l) => l.bundleId).filter(Boolean))] as string[];
  if (ids.length === 0) return { bundleDiscount: 0, bundles: [] };

  const rows = await db
    .select({ id: productBundles.id, name: productBundles.name, price: productBundles.price, isActive: productBundles.isActive })
    .from(productBundles)
    .where(inArray(productBundles.id, ids));

  const result: { id: string; name: string; saving: number }[] = [];
  let total = 0;

  for (const bundle of rows) {
    if (!bundle.isActive) continue;

    const group = lines.filter((l) => l.bundleId === bundle.id);
    if (group.length === 0 || group.some((l) => !l.available)) continue;

    for (const line of group) line.bundleName = bundle.name;

    const parts = group.reduce((sum, l) => sum + l.lineTotal, 0);
    // Never negative: a bundle priced above its parts is a pricing mistake, not
    // a surcharge to collect.
    const saving = Math.max(0, parts - bundle.price);
    if (saving === 0) continue;

    result.push({ id: bundle.id, name: bundle.name, saving });
    total += saving;
  }

  return { bundleDiscount: total, bundles: result };
}

/**
 * Adds every component of a bundle as ordinary variant lines.
 *
 * Expanding here rather than storing a bundle as its own line type is what
 * keeps stock decrement, order items and fulfilment on a single code path.
 */
export async function addBundleLines(cart: CartCookie, bundleId: string): Promise<CartCookie> {
  const items = await db
    .select({ variantId: bundleItems.variantId, qty: bundleItems.qty })
    .from(bundleItems)
    .where(eq(bundleItems.bundleId, bundleId));

  let next = cart;
  for (const item of items) {
    next = addLine(next, item.variantId, item.qty, bundleId);
  }

  return next;
}

/** Merges a quantity into the cart, clamping and enforcing the line cap. */
export function addLine(
  cart: CartCookie,
  variantId: string,
  qty: number,
  bundleId?: string
): CartCookie {
  // A bundle line is kept separate from a loose line of the same variant:
  // merging them would silently absorb the loose one into the bundle price.
  const existing = cart.lines.find(
    (l) => l.variantId === variantId && l.bundleId === bundleId
  );

  if (existing) {
    return {
      lines: cart.lines.map((l) =>
        l.variantId === variantId && l.bundleId === bundleId
          ? { ...l, qty: Math.min(MAX_QTY, l.qty + qty) }
          : l
      ),
    };
  }

  if (cart.lines.length >= MAX_LINES) return cart;

  return {
    lines: [
      ...cart.lines,
      { variantId, qty: Math.min(MAX_QTY, Math.max(1, qty)), ...(bundleId ? { bundleId } : {}) },
    ],
  };
}

export function setLineQty(cart: CartCookie, variantId: string, qty: number): CartCookie {
  if (qty <= 0) return { lines: cart.lines.filter((l) => l.variantId !== variantId) };
  return {
    lines: cart.lines.map((l) =>
      l.variantId === variantId ? { ...l, qty: Math.min(MAX_QTY, qty) } : l
    ),
  };
}
