// app/api/account/wishlist/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { addToWishlist, removeFromWishlist } from '@/lib/account/profile';
import { requireCustomer, fail } from '@/lib/account/http';

export const runtime = 'nodejs';

const schema = z.object({ productId: z.string().uuid() });

export async function POST(request: Request) {
  const session = await requireCustomer(request);
  if (!session.ok) return session.response;
  try {
    const { productId } = schema.parse(await request.json());
    await addToWishlist(session.customer.sub, productId);
    return NextResponse.json({ success: true, data: { saved: true } });
  } catch {
    return fail('طلب غير صالح', 400);
  }
}

export async function DELETE(request: Request) {
  const session = await requireCustomer(request);
  if (!session.ok) return session.response;
  try {
    const { productId } = schema.parse(await request.json());
    await removeFromWishlist(session.customer.sub, productId);
    return NextResponse.json({ success: true, data: { saved: false } });
  } catch {
    return fail('طلب غير صالح', 400);
  }
}
