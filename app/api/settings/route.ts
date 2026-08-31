// app/api/settings/route.ts
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { settings, auditLog } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { settingsSchema } from '@/lib/settings-schema';

export async function PUT(request: Request) {
  // Settings are site-wide (tracking scripts, custom CSS, commerce toggle), so
  // this is admin-only rather than editor-or-above.
  const auth = await requireApiAuth(request, ['admin']);
  if (!auth.ok) return auth.response;

  try {
    const data = settingsSchema.parse(await request.json());

    const empty = (v?: string) => (v && v.length > 0 ? v : null);

    const values = {
      siteName: data.siteName,
      siteDescription: empty(data.siteDescription),
      logo: empty(data.logo),
      favicon: empty(data.favicon),
      contactEmail: empty(data.contactEmail),
      contactPhone: empty(data.contactPhone),
      socialLinks: data.socialLinks ?? {},
      analyticsId: empty(data.analyticsId),
      gtmId: empty(data.gtmId),
      ga4Id: empty(data.ga4Id),
      metaPixelId: empty(data.metaPixelId),
      tiktokPixelId: empty(data.tiktokPixelId),
      snapPixelId: empty(data.snapPixelId),
      // Already validated by themeSchema: only known slots, only hex values.
      theme: data.theme ?? null,
      themeDark: data.themeDark ?? null,
      themeMode: data.themeMode ?? 'light',
      customCss: empty(data.customCss),
      comingSoonMode: data.comingSoonMode,
      comingSoonMessage: empty(data.comingSoonMessage),
      eCommerceEnabled: data.eCommerceEnabled,
      currency: data.currency,
      updatedAt: new Date(),
    };

    const existing = await db.select({ id: settings.id }).from(settings).limit(1);

    if (existing[0]) {
      await db.update(settings).set(values).where(eq(settings.id, existing[0].id));
    } else {
      await db.insert(settings).values({ id: 1, ...values });
    }

    await db.insert(auditLog).values({
      userId: auth.user.sub,
      action: 'settings.update',
      entityType: 'settings',
      entityId: '1',
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: request.headers.get('user-agent') ?? null,
    });

    // Site name, logo and the commerce toggle are read by cached layouts.
    revalidatePath('/', 'layout');

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: 'Validation failed', issues: error.issues } },
        { status: 400 }
      );
    }
    console.error('Settings update error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Internal server error' } },
      { status: 500 }
    );
  }
}
