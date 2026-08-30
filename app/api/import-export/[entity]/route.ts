// app/api/import-export/[entity]/route.ts
import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { findEntity, isImportable, templateFor } from '@/lib/import-export/registry';
import { isTableFormat, parseUpload, toCsv, toXlsx, type Table } from '@/lib/import-export/table';
import { planImport } from '@/lib/import-export/plan';
import { applyPlan, existingKeys, exportTable } from '@/lib/import-export/entities';
import { db } from '@/lib/db';
import { auditLog } from '@/lib/db/schema';

export const runtime = 'nodejs';

/** Uploads are read into memory, so the size is capped before that happens. */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * GET  — download the current rows, or a blank template (?template=1).
 * POST — upload a file; a dry run by default, applied only with ?apply=1.
 *
 * Exports are served as an attachment from a route rather than built in the
 * browser: script-driven saves are blocked in some embedding contexts, and the
 * whole dataset stays on the server instead of being shipped out to be
 * re-serialised.
 */
export async function GET(request: Request, context: { params: Promise<{ entity: string }> }) {
  const { entity: entityId } = await context.params;
  const entity = findEntity(entityId);
  if (!entity) return NextResponse.json({ success: false, error: { message: 'Unknown entity' } }, { status: 404 });

  /**
   * Customers and reviews carry personal data — names, phone numbers, order
   * histories — so exporting them is an admin action, not an editor one, and
   * it is written to the audit log. "Who downloaded the customer list" should
   * always be answerable.
   */
  const personal = entityId === 'customers' || entityId === 'reviews';
  const auth = await requireApiAuth(request, personal ? ['admin'] : ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const formatParam = url.searchParams.get('format');
  const format = isTableFormat(formatParam) ? formatParam : 'csv';
  const wantsTemplate = url.searchParams.get('template') === '1';

  try {
    const table: Table = wantsTemplate ? templateFor(entity) : await exportTable(entity);
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `${entityId}-${wantsTemplate ? 'template' : stamp}.${format}`;

    if (personal && !wantsTemplate) {
      await db.insert(auditLog).values({
        userId: auth.user.sub,
        action: 'export',
        entityType: entityId,
        payload: { rows: table.rows.length, format },
      });
    }

    if (format === 'xlsx') {
      const buffer = await toXlsx(table, entity.labelEn);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return new NextResponse(toCsv(table), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Export failed:', error);
    return NextResponse.json({ success: false, error: { message: 'Export failed' } }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ entity: string }> }) {
  const { entity: entityId } = await context.params;
  const entity = findEntity(entityId);
  if (!entity) return NextResponse.json({ success: false, error: { message: 'Unknown entity' } }, { status: 404 });

  // Importing rewrites the catalogue, so it is admin-only regardless of entity.
  const auth = await requireApiAuth(request, ['admin']);
  if (!auth.ok) return auth.response;

  if (!isImportable(entity)) {
    return NextResponse.json(
      { success: false, error: { message: `${entity.labelEn} is export-only` } },
      { status: 400 }
    );
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: { message: 'No file uploaded' } }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ success: false, error: { message: 'File is larger than 8 MB' } }, { status: 400 });
  }

  try {
    const table = await parseUpload(file);
    const plan = planImport(entity, table, await existingKeys(entity));

    const summary = {
      total: table.rows.length,
      create: plan.create.length,
      update: plan.update.length,
      rejected: plan.rejected,
      unknownColumns: plan.unknownColumns,
      missingColumns: plan.missingColumns,
    };

    // Dry run unless explicitly applied. A spreadsheet must never reach a live
    // catalogue on the strength of one click.
    if (new URL(request.url).searchParams.get('apply') !== '1') {
      return NextResponse.json({ success: true, data: { applied: false, ...summary } });
    }

    if (plan.missingColumns.length > 0) {
      return NextResponse.json(
        { success: false, error: { message: 'The file is missing required columns' }, data: summary },
        { status: 400 }
      );
    }

    const result = await applyPlan(entity, plan);

    await db.insert(auditLog).values({
      userId: auth.user.sub,
      action: 'import',
      entityType: entityId,
      payload: { created: result.created, updated: result.updated, failed: result.failed.length },
    });

    return NextResponse.json({ success: true, data: { applied: true, ...summary, ...result } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not read that file';
    return NextResponse.json({ success: false, error: { message } }, { status: 400 });
  }
}
