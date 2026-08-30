// app/api/account/profile/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { updateProfile } from '@/lib/account/profile';
import { setPassword, MIN_PASSWORD_LENGTH } from '@/lib/account/register';
import { requireCustomer, fail } from '@/lib/account/http';

export const runtime = 'nodejs';

const schema = z.object({
  name: z.string().trim().min(2).max(255),
  email: z.union([z.literal(''), z.string().email()]).nullable().optional(),
  /** Optional: set or change the password from the same form. */
  password: z.union([z.literal(''), z.string().min(MIN_PASSWORD_LENGTH).max(200)]).nullable().optional(),
});

export async function PATCH(request: Request) {
  const session = await requireCustomer(request);
  if (!session.ok) return session.response;

  try {
    const data = schema.parse(await request.json());
    await updateProfile(session.customer.sub, { name: data.name, email: data.email || null });

    // The phone is NOT editable here: it is the identity this session proves
    // and the key that ties orders to this person. Changing it would mean
    // proving the new number, which is the register flow.
    if (data.password) await setPassword(session.customer.sub, data.password);

    return NextResponse.json({ success: true });
  } catch {
    return fail('طلب غير صالح', 400);
  }
}
