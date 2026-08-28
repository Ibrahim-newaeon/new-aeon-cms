// app/api/forms/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { formSubmissions } from '@/lib/db/schema';
import { rateLimit, clientKey } from '@/lib/rate-limit';
import { notifyFormSubmission } from '@/lib/email/notify';

/**
 * Public endpoint — no auth, by definition. Protections are: rate limiting, a
 * honeypot field, a size cap, and an origin check (a public form still has no
 * reason to accept cross-site posts).
 */
const submissionSchema = z.object({
  type: z.enum(['contact', 'newsletter']),
  pageSlug: z.string().max(255).optional(),
  locale: z.enum(['ar', 'en']).optional(),
  // Bots fill hidden inputs; humans never see this one.
  website: z.string().max(0).optional(),
  fields: z.record(z.string().max(5000)).refine(
    (f) => Object.keys(f).length <= 12,
    'Too many fields'
  ),
});

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return request.headers.get('sec-fetch-site') === 'same-origin';
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { success: false, error: { message: 'Cross-site request blocked' } },
      { status: 403 }
    );
  }

  const limit = await rateLimit(clientKey(request, 'forms'), 5, 600);
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: { message: 'محاولات كثيرة. حاول لاحقاً.' } },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const parsed = submissionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { message: 'بيانات غير صالحة' } },
        { status: 400 }
      );
    }

    // Honeypot tripped: answer 200 so the bot cannot distinguish success.
    if (parsed.data.website) {
      return NextResponse.json({ success: true });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

    await db.insert(formSubmissions).values({
      type: parsed.data.type,
      payload: parsed.data.fields,
      pageSlug: parsed.data.pageSlug ?? null,
      locale: parsed.data.locale ?? null,
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') ?? null,
    });

    // The row is what we promise to keep; the email is a courtesy on top. So
    // this runs after the insert and cannot fail the request — a submission
    // that is stored but unannounced is recoverable, one that is neither is not.
    await notifyFormSubmission({
      type: parsed.data.type,
      locale: parsed.data.locale ?? 'ar',
      fields: parsed.data.fields,
      pageSlug: parsed.data.pageSlug,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Form submission error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'تعذّر الإرسال' } },
      { status: 500 }
    );
  }
}
