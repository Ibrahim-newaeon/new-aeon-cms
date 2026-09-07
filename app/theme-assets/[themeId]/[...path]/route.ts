// app/theme-assets/[themeId]/[...path]/route.ts
// Serves files from an extracted theme pack. No directory listing.

import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { themeDir } from '@/lib/themes/store';
import { THEME_ALLOWED_EXTENSIONS } from '@/lib/themes/limits';

const MIME: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

type Ctx = { params: Promise<{ themeId: string; path: string[] }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { themeId, path: parts } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(themeId)) {
    return new NextResponse('Not found', { status: 404 });
  }
  if (!parts?.length) {
    return new NextResponse('Not found', { status: 404 });
  }
  if (parts.some((p) => !p || p === '..' || p.includes('\\'))) {
    return new NextResponse('Not found', { status: 404 });
  }

  const rel = parts.join('/');
  const ext = path.extname(rel).toLowerCase();
  if (!THEME_ALLOWED_EXTENSIONS.has(ext)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const root = themeDir(themeId);
  const file = path.join(root, rel);
  if (!file.startsWith(root + path.sep)) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const data = await fs.readFile(file);
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
