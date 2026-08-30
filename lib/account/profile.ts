// lib/account/profile.ts
import 'server-only';
import { db } from '@/lib/db';
import {
  customers, customerAddresses, wishlistItems, products,
} from '@/lib/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';

/** The saved details a shopper should never have to retype. */
export async function getProfile(customerId: string) {
  const [row] = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      email: customers.email,
      registeredAt: customers.registeredAt,
      hasPassword: sql<boolean>`${customers.passwordHash} is not null`,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  return row ?? null;
}

export async function updateProfile(
  customerId: string,
  input: { name: string; email: string | null }
): Promise<void> {
  await db
    .update(customers)
    .set({ name: input.name, email: input.email, updatedAt: new Date() })
    .where(eq(customers.id, customerId));
}

// ─── address book ────────────────────────────────────────

export type AddressInput = {
  label?: string | null;
  name: string;
  phone: string;
  governorate: string;
  city: string;
  addressLine: string;
  landmark?: string | null;
  isDefault?: boolean;
};

export async function listAddresses(customerId: string) {
  return db
    .select()
    .from(customerAddresses)
    .where(eq(customerAddresses.customerId, customerId))
    // Default first, then newest — the one they want is almost always one of
    // those two.
    .orderBy(desc(customerAddresses.isDefault), desc(customerAddresses.createdAt));
}

export async function getDefaultAddress(customerId: string) {
  const rows = await listAddresses(customerId);
  return rows[0] ?? null;
}

/**
 * Adds an address, keeping exactly one default.
 *
 * The unique index allows only one default row per customer, so clearing the
 * others has to happen in the SAME transaction — otherwise a second insert
 * races the clear and the write fails with a constraint error the shopper
 * would see as "could not save".
 */
export async function addAddress(customerId: string, input: AddressInput) {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(customerAddresses)
      .where(eq(customerAddresses.customerId, customerId));

    // The first address is the default whether or not they ticked the box.
    const makeDefault = input.isDefault || (existing[0]?.n ?? 0) === 0;

    if (makeDefault) {
      await tx
        .update(customerAddresses)
        .set({ isDefault: false })
        .where(eq(customerAddresses.customerId, customerId));
    }

    const [row] = await tx
      .insert(customerAddresses)
      .values({
        customerId,
        label: input.label ?? null,
        name: input.name,
        phone: input.phone,
        governorate: input.governorate,
        city: input.city,
        addressLine: input.addressLine,
        landmark: input.landmark ?? null,
        isDefault: makeDefault,
      })
      .returning({ id: customerAddresses.id });

    return row!.id;
  });
}

export async function makeDefaultAddress(customerId: string, addressId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(customerAddresses)
      .set({ isDefault: false })
      .where(eq(customerAddresses.customerId, customerId));
    await tx
      .update(customerAddresses)
      .set({ isDefault: true })
      .where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customerId)));
  });
}

/** Scoped by customer id, so an id from another account deletes nothing. */
export async function deleteAddress(customerId: string, addressId: string): Promise<void> {
  await db
    .delete(customerAddresses)
    .where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customerId)));
}

// ─── wishlist ────────────────────────────────────────────

export async function listWishlist(customerId: string, locale: 'ar' | 'en') {
  return db
    .select({
      productId: products.id,
      slug: products.slug,
      basePrice: products.basePrice,
      compareAtPrice: products.compareAtPrice,
      isActive: products.isActive,
      name: sql<string>`coalesce(
        (select i.name from product_i18n i
          where i.product_id = products.id and i.locale::text = ${locale}),
        (select i.name from product_i18n i
          where i.product_id = products.id order by i.locale limit 1),
        products.slug
      )`,
      image: sql<string | null>`(
        select pi.url from product_images pi
        where pi.product_id = products.id order by pi.sort_order asc nulls last limit 1
      )`,
      addedAt: wishlistItems.createdAt,
    })
    .from(wishlistItems)
    .innerJoin(products, eq(products.id, wishlistItems.productId))
    .where(eq(wishlistItems.customerId, customerId))
    .orderBy(desc(wishlistItems.createdAt));
}

export async function addToWishlist(customerId: string, productId: string): Promise<void> {
  // Saving something already saved is not an error, it is a no-op.
  await db.insert(wishlistItems).values({ customerId, productId }).onConflictDoNothing();
}

export async function removeFromWishlist(customerId: string, productId: string): Promise<void> {
  await db
    .delete(wishlistItems)
    .where(and(eq(wishlistItems.customerId, customerId), eq(wishlistItems.productId, productId)));
}

export async function isWishlisted(customerId: string, productId: string): Promise<boolean> {
  const [row] = await db
    .select({ productId: wishlistItems.productId })
    .from(wishlistItems)
    .where(and(eq(wishlistItems.customerId, customerId), eq(wishlistItems.productId, productId)))
    .limit(1);
  return Boolean(row);
}

export async function wishlistCount(customerId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(wishlistItems)
    .where(eq(wishlistItems.customerId, customerId));
  return row?.n ?? 0;
}
