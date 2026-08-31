// app/api/backup/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditLog } from '@/lib/db/schema';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { getSettings } from '@/lib/db/queries';
import { createBackupStream } from '@/lib/backup/export';

export const runtime = 'nodejs';
// Streamed and never cached: it contains customer records.
export const dynamic = 'force-dynamic';

/**
 * Download everything.
 *
 * Admin only, not editor. This one file contains every customer's name, phone
 * number, address and order history, which makes downloading it a more serious
 * act than exporting a product list — and the reason it is written to the
 * audit log, like the customer export beside it. "Who took a copy of the
 * database" should always be answerable.
 */
export async function GET(request: Request) {
  const auth = await requireApiAuth(request, ['admin']);
  if (!auth.ok) return auth.response;

  const settings = await getSettings();
  const siteName = settings?.siteName ?? 'site';

  const { stream, done } = createBackupStream(siteName);

  /**
   * Logged when the download STARTS, not when it finishes. A stream that is
   * abandoned halfway still handed over whatever was sent, so recording it
   * only on success would leave exactly the interesting case unrecorded.
   */
  await db.insert(auditLog).values({
    userId: auth.user.sub,
    action: 'backup.download',
    entityType: 'backup',
    entityId: null,
    payload: { startedAt: new Date().toISOString() },
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: request.headers.get('user-agent'),
  });

  // Failures after the headers are sent cannot become a 500 — the body is
  // already flowing — so they are logged and the archive ends short. The
  // manifest inside records what was skipped.
  void done.catch((error) => console.error('Backup failed mid-stream:', error));

  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = siteName.replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'site';

  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeName}-backup-${stamp}.zip"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
