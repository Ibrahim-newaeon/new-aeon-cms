// tests/uploads-route.test.ts
//
// The /uploads route exists so media on a mounted volume is reachable at all.
// It is also an arbitrary-file-read waiting to happen if the path handling is
// wrong, so the traversal cases matter more than the happy one.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { GET } from '@/app/uploads/[...path]/route';

const ROOT = path.join(process.cwd(), '.tmp-verify', 'uploads-route');
const OUTSIDE = path.join(process.cwd(), '.tmp-verify', 'uploads-outside');
const prev = process.env.UPLOAD_DIR;

/** The route reads params from a promise, the way Next hands them over. */
function call(parts: string[]) {
  return GET(new Request('http://localhost/uploads/x'), {
    params: Promise.resolve({ path: parts }),
  });
}

beforeAll(async () => {
  process.env.UPLOAD_DIR = ROOT;
  await fs.mkdir(path.join(ROOT, '2026', '09'), { recursive: true });
  await fs.writeFile(path.join(ROOT, '2026', '09', 'a.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await fs.writeFile(path.join(ROOT, '2026', '09', 'clip.mp4'), Buffer.from([0x00, 0x01]));
  await fs.writeFile(path.join(ROOT, 'notes.exe'), Buffer.from([0x4d, 0x5a]));

  await fs.mkdir(OUTSIDE, { recursive: true });
  await fs.writeFile(path.join(OUTSIDE, 'secret.png'), Buffer.from([0x89]));
});

afterAll(async () => {
  await fs.rm(ROOT, { recursive: true, force: true });
  await fs.rm(OUTSIDE, { recursive: true, force: true });
  if (prev === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = prev;
});

describe('GET /uploads/[...path]', () => {
  it('serves a stored image with its declared type', async () => {
    const res = await call(['2026', '09', 'a.png']);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(await res.arrayBuffer()).toHaveProperty('byteLength', 4);
  });

  it('serves video, which the slider block needs', async () => {
    const res = await call(['2026', '09', 'clip.mp4']);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('video/mp4');
  });

  /**
   * Stored names are a UUID plus an extension, so one URL can only ever return
   * one set of bytes — replacing an image writes a new row under a new name.
   */
  it('marks responses immutable', async () => {
    const res = await call(['2026', '09', 'a.png']);
    expect(res.headers.get('Cache-Control')).toContain('immutable');
  });

  /**
   * Visitor-supplied bytes from our own origin. A browser that sniffs a .png
   * into text/html has been handed stored XSS.
   */
  it('sends the anti-sniffing headers', async () => {
    const res = await call(['2026', '09', 'a.png']);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
  });

  it('404s an extension the uploader would never have accepted', async () => {
    expect((await call(['notes.exe'])).status).toBe(404);
  });

  it('404s a file that is not there', async () => {
    expect((await call(['2026', '09', 'missing.png'])).status).toBe(404);
  });

  it('404s an empty path rather than listing the directory', async () => {
    expect((await call([])).status).toBe(404);
  });

  it('refuses traversal out of the upload root', async () => {
    expect((await call(['..', 'uploads-outside', 'secret.png'])).status).toBe(404);
    expect((await call(['2026', '..', '..', 'uploads-outside', 'secret.png'])).status).toBe(404);
  });

  it('refuses backslashes, which no key this app writes contains', async () => {
    expect((await call(['2026\\09\\a.png'])).status).toBe(404);
  });

  it('refuses an empty segment', async () => {
    expect((await call(['2026', '', 'a.png'])).status).toBe(404);
  });
});
