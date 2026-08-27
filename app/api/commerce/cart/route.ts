// app/api/commerce/cart/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readCartCookie, writeCartCookie, addLine, setLineQty } from '@/lib/commerce/cart';
import { commerceEnabled } from '@/lib/commerce/guard';

export const runtime = 'nodejs';

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), variantId: z.string().uuid(), qty: z.number().int().min(1).max(99) }),
  z.object({ action: z.literal('set'), variantId: z.string().uuid(), qty: z.number().int().min(0).max(99) }),
  z.object({ action: z.literal('clear') }),
]);

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return request.headers.get('sec-fetch-site') === 'same-origin';
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ success: false }, { status: 403 });
  }
  if (!(await commerceEnabled())) {
    return NextResponse.json({ success: false }, { status: 404 });
  }

  try {
    const body = bodySchema.parse(await request.json());
    const cart = await readCartCookie();

    if (body.action === 'clear') {
      await writeCartCookie({ lines: [] });
      return NextResponse.json({ success: true });
    }

    // Quantities are clamped here and re-checked against real stock when the
    // cart is priced — the cookie never decides what is purchasable.
    const next =
      body.action === 'add'
        ? addLine(cart, body.variantId, body.qty)
        : setLineQty(cart, body.variantId, body.qty);

    await writeCartCookie(next);
    return NextResponse.json({ success: true, data: { lines: next.lines.length } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: { message: 'طلب غير صالح' } }, { status: 400 });
    }
    console.error('Cart error:', error);
    return NextResponse.json({ success: false, error: { message: 'تعذّر تحديث السلة' } }, { status: 500 });
  }
}
