// app/api/webhooks/paddle/route.ts
import { NextResponse } from 'next/server';
import { EventName, unmarshalPaddleEvent, paddleConfigured } from '@/lib/payments';
import { setPaymentStatus } from '@/lib/commerce/orders';
import { db } from '@/lib/db';
import { orders } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

/**
 * Paddle Billing notifications.
 *
 * Must receive the RAW body — signature verification fails if anything
 * re-serialises JSON. Next.js App Router gives us text() for that.
 */
export async function POST(request: Request) {
  if (!paddleConfigured()) {
    return NextResponse.json({ error: 'Paddle not configured' }, { status: 503 });
  }

  const signature = request.headers.get('paddle-signature') ?? '';
  const rawBody = await request.text();

  let event;
  try {
    event = await unmarshalPaddleEvent(rawBody, signature);
  } catch (err) {
    console.error('Paddle webhook signature failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.eventType) {
      case EventName.TransactionCompleted:
      case EventName.TransactionPaid: {
        const data = event.data as {
          customData?: { orderId?: string; orderNumber?: string } | null;
          id?: string;
        };
        const orderId = data.customData?.orderId;
        if (orderId) {
          await setPaymentStatus(orderId, 'paid');
        } else if (data.customData?.orderNumber) {
          const row = await db
            .select({ id: orders.id })
            .from(orders)
            .where(eq(orders.orderNumber, data.customData.orderNumber))
            .limit(1);
          if (row[0]) await setPaymentStatus(row[0].id, 'paid');
        }
        break;
      }
      case EventName.TransactionPaymentFailed:
      case EventName.TransactionPastDue: {
        const data = event.data as {
          customData?: { orderId?: string; orderNumber?: string } | null;
        };
        const orderId = data.customData?.orderId;
        if (orderId) {
          await setPaymentStatus(orderId, 'failed');
        } else if (data.customData?.orderNumber) {
          const row = await db
            .select({ id: orders.id })
            .from(orders)
            .where(eq(orders.orderNumber, data.customData.orderNumber))
            .limit(1);
          if (row[0]) await setPaymentStatus(row[0].id, 'failed');
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error('Paddle webhook handler error:', err);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
