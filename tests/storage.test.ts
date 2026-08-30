import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = mkdtempSync(path.join(tmpdir(), 'aeon-storage-'));
process.env.UPLOAD_DIR = root;
process.env.STORAGE_DRIVER = 'local';

const {
  storeUpload,
  deleteStored,
  activeDriver,
  ALLOWED_MIME,
  MAX_BYTES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_DOCUMENT_BYTES,
  UPLOAD_ACCEPT,
  maxBytesFor,
} = await import('@/lib/media/storage');
const { localDriver } = await import('@/lib/media/drivers/local');
const { s3Driver } = await import('@/lib/media/drivers/s3');

afterAll(() => rmSync(root, { recursive: true, force: true }));

function file(name: string, type: string, bytes = 16): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('upload policy', () => {
  it('excludes SVG from the allow-list', () => {
    // An SVG is a document that can carry <script>, served same-origin from our
    // own domain — stored XSS dressed up as an image.
    expect(ALLOWED_MIME['image/svg+xml']).toBeUndefined();
  });

  it('allows exactly the intended types', () => {
    // mp4 and webm are here because the slider offers video slides; without
    // them the library could not produce a file that block accepts.
    // Word, Excel and CSV are here because a Resources page hands documents
    // to a reader; refusing them pushes people back to email attachments.
    expect(Object.keys(ALLOWED_MIME).sort()).toEqual([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp',
      'text/csv', 'video/mp4', 'video/webm',
    ]);
  });

  it('offers the picker exactly what the server accepts', () => {
    // The accept attribute used to be a hand-written copy, so a type added to
    // the allow-list was one the browser would refuse to offer.
    expect(UPLOAD_ACCEPT.split(',').sort()).toEqual(Object.keys(ALLOWED_MIME).sort());
  });

  it('gives each kind its own cap', () => {
    // One number cannot serve all three: 8 MB is generous for a hero image,
    // too tight for a 1080p loop, and too tight for a catalogue PDF.
    expect(maxBytesFor('image/png')).toBe(MAX_IMAGE_BYTES);
    expect(maxBytesFor('video/mp4')).toBe(MAX_VIDEO_BYTES);
    expect(maxBytesFor('application/pdf')).toBe(MAX_DOCUMENT_BYTES);
    expect(maxBytesFor('text/csv')).toBe(MAX_DOCUMENT_BYTES);
    expect(
      maxBytesFor('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    ).toBe(MAX_DOCUMENT_BYTES);
    expect(MAX_VIDEO_BYTES).toBeGreaterThan(MAX_IMAGE_BYTES);
    expect(MAX_DOCUMENT_BYTES).toBeGreaterThan(MAX_IMAGE_BYTES);
  });

  it('does not send a document through the image pipeline', async () => {
    // sharp would load a decoder, fail on a PDF, and be swallowed by a catch.
    const stored = await storeUpload(file('spec.pdf', 'application/pdf', 1024));
    expect(stored.thumbnailUrl).toBeNull();
    expect(stored.width).toBeNull();
  });

  it('holds a video to the video cap, not the image one', async () => {
    await expect(
      storeUpload(file('big.mp4', 'video/mp4', MAX_VIDEO_BYTES + 1))
    ).rejects.toThrow('TOO_LARGE');

    // Comfortably over the image cap, and accepted, which is the whole point.
    const stored = await storeUpload(file('clip.mp4', 'video/mp4', MAX_IMAGE_BYTES + 1));
    expect(stored.mimeType).toBe('video/mp4');
    // No sharp probe on a video: no dimensions and no thumbnail, rather than a
    // decoder failure swallowed by a catch.
    expect(stored.thumbnailUrl).toBeNull();
    expect(stored.width).toBeNull();
  });

  it('rejects a disallowed type before writing anything', async () => {
    await expect(storeUpload(file('x.svg', 'image/svg+xml'))).rejects.toThrow('UNSUPPORTED_TYPE');
    await expect(storeUpload(file('x.html', 'text/html'))).rejects.toThrow('UNSUPPORTED_TYPE');
    await expect(storeUpload(file('x', ''))).rejects.toThrow('UNSUPPORTED_TYPE');
  });

  it('rejects anything over the 8 MB cap', async () => {
    expect(MAX_BYTES).toBe(8 * 1024 * 1024);
    await expect(storeUpload(file('big.png', 'image/png', MAX_BYTES + 1))).rejects.toThrow('TOO_LARGE');
  });

  it('accepts a file exactly at the cap', async () => {
    const stored = await storeUpload(file('edge.png', 'image/png', MAX_BYTES));
    expect(stored.size).toBe(MAX_BYTES);
  });
});

describe('generated names', () => {
  it('never reuses the uploaded filename', async () => {
    // A user-supplied name could contain `../` or a second extension
    // (`x.php.png`); neither survives a UUID plus an allow-listed extension.
    const stored = await storeUpload(file('../../etc/passwd.png', 'image/png'));

    expect(stored.filename).not.toContain('passwd');
    expect(stored.filename).not.toContain('..');
    expect(stored.filename).toMatch(/^[0-9a-f-]{36}\.png$/);
  });

  it('derives the extension from the MIME type, not the name', async () => {
    const stored = await storeUpload(file('trick.php', 'image/jpeg'));
    expect(stored.filename.endsWith('.jpg')).toBe(true);
  });

  it('gives every upload a distinct key', async () => {
    const keys = new Set<string>();
    for (let i = 0; i < 5; i++) keys.add((await storeUpload(file('a.png', 'image/png'))).filename);
    expect(keys.size).toBe(5);
  });

  it('files under a yyyy/mm prefix, so a bucket copy keeps the same layout', async () => {
    const stored = await storeUpload(file('a.png', 'image/png'));
    expect(stored.url).toMatch(/^\/uploads\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);
  });
});

describe('local driver round trip', () => {
  it('writes the bytes and serves them from the matching URL', async () => {
    const stored = await storeUpload(file('a.png', 'image/png', 32));
    const onDisk = path.join(root, stored.url.replace('/uploads/', ''));

    expect(existsSync(onDisk)).toBe(true);
    expect(stored.size).toBe(32);
  });

  it('removes the file on delete', async () => {
    const stored = await storeUpload(file('a.png', 'image/png'));
    const onDisk = path.join(root, stored.url.replace('/uploads/', ''));

    await deleteStored(stored.url);
    expect(existsSync(onDisk)).toBe(false);
  });

  it('resolves rather than throwing when the file is already gone', async () => {
    // The caller is deleting a database row; that outcome is still right.
    await expect(deleteStored('/uploads/2020/01/missing.png')).resolves.toBeUndefined();
  });

  it('ignores null', async () => {
    await expect(deleteStored(null)).resolves.toBeUndefined();
  });
});

describe('path traversal', () => {
  it('refuses to delete outside the upload root', async () => {
    const outside = path.join(root, '..', `aeon-victim-${process.pid}.txt`);
    writeFileSync(outside, 'do not delete me');

    try {
      await deleteStored(`/uploads/../aeon-victim-${process.pid}.txt`);
      expect(existsSync(outside)).toBe(true);

      await deleteStored('/uploads/../../../../../../etc/passwd');
      expect(existsSync(outside)).toBe(true);
    } finally {
      rmSync(outside, { force: true });
    }
  });

  it('still deletes a legitimate nested path', async () => {
    const dir = path.join(root, '2026', '01');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'real.png'), 'x');

    await deleteStored('/uploads/2026/01/real.png');
    expect(existsSync(path.join(dir, 'real.png'))).toBe(false);
  });
});

describe('driver ownership and delete routing', () => {
  it('the local driver claims only /uploads/ URLs', () => {
    expect(localDriver.owns('/uploads/2026/08/a.png')).toBe(true);
    expect(localDriver.owns('https://media.example.com/2026/08/a.png')).toBe(false);
    expect(localDriver.owns('/other/a.png')).toBe(false);
  });

  it('the s3 driver claims nothing when no bucket is configured', () => {
    // Otherwise an unconfigured install would route deletes into a client that
    // cannot be built.
    expect(s3Driver.owns('/uploads/2026/08/a.png')).toBe(false);
  });

  it('routes on URL shape, not the configured driver', async () => {
    // After switching to s3 the database still holds /uploads/ rows from
    // before the migration, and only the local driver can clean those up.
    process.env.STORAGE_DRIVER = 's3';
    try {
      expect(activeDriver().name).toBe('s3');

      const dir = path.join(root, '2026', '02');
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'legacy.png'), 'x');

      await deleteStored('/uploads/2026/02/legacy.png');
      expect(existsSync(path.join(dir, 'legacy.png'))).toBe(false);
    } finally {
      process.env.STORAGE_DRIVER = 'local';
    }
  });

  it('ignores a URL that matches no driver rather than guessing', async () => {
    await expect(deleteStored('https://evil.example.com/x.png')).resolves.toBeUndefined();
    await expect(deleteStored('not a url')).resolves.toBeUndefined();
  });
});

describe('driver selection', () => {
  beforeEach(() => {
    process.env.STORAGE_DRIVER = 'local';
  });

  it('defaults to local so a fresh clone needs no bucket credentials', () => {
    delete process.env.STORAGE_DRIVER;
    expect(activeDriver().name).toBe('local');
  });

  it('falls back to local on an unrecognised value rather than failing closed', () => {
    process.env.STORAGE_DRIVER = 'gcs';
    expect(activeDriver().name).toBe('local');
  });
});
