// app/api/account/addresses/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { addAddress, deleteAddress, makeDefaultAddress } from '@/lib/account/profile';
import { normalisePhone, isValidMobile, isRegionOf } from '@/lib/commerce/phone';
import { getStoreCountry, getShippingRegions } from '@/lib/commerce/regions';
import { requireCustomer, fail } from '@/lib/account/http';

export const runtime = 'nodejs';

const schema = z.object({
  label: z.string().trim().max(100).nullable().optional(),
  name: z.string().trim().min(2).max(255),
  phone: z.string().trim().min(3).max(32),
  governorate: z.string().trim().max(100),
  city: z.string().trim().min(2).max(100),
  addressLine: z.string().trim().min(5).max(500),
  landmark: z.string().trim().max(255).nullable().optional(),
  isDefault: z.boolean().optional(),
});

export async function POST(request: Request) {
  const session = await requireCustomer(request);
  if (!session.ok) return session.response;

  try {
    const data = schema.parse(await request.json());
    const [country, regions] = await Promise.all([getStoreCountry(), getShippingRegions()]);

    if (!isValidMobile(data.phone, country)) return fail('رقم هاتف غير صالح', 400);
    // Checked against the store's own list, so a saved address cannot name a
    // region checkout will later refuse to ship to.
    if (!isRegionOf(regions, data.governorate)) return fail('اختر المنطقة', 400);

    const id = await addAddress(session.customer.sub, {
      ...data,
      phone: normalisePhone(data.phone, country),
    });
    return NextResponse.json({ success: true, data: { id } }, { status: 201 });
  } catch {
    return fail('طلب غير صالح', 400);
  }
}

const idSchema = z.object({ id: z.string().uuid() });

export async function PATCH(request: Request) {
  const session = await requireCustomer(request);
  if (!session.ok) return session.response;
  try {
    const { id } = idSchema.parse(await request.json());
    // Scoped to this customer inside, so another account's id changes nothing.
    await makeDefaultAddress(session.customer.sub, id);
    return NextResponse.json({ success: true });
  } catch {
    return fail('طلب غير صالح', 400);
  }
}

export async function DELETE(request: Request) {
  const session = await requireCustomer(request);
  if (!session.ok) return session.response;
  try {
    const { id } = idSchema.parse(await request.json());
    await deleteAddress(session.customer.sub, id);
    return NextResponse.json({ success: true });
  } catch {
    return fail('طلب غير صالح', 400);
  }
}
