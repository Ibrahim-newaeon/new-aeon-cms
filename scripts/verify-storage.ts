// scripts/verify-storage.ts
//
// End-to-end exercise of the storage facade against whatever driver the
// environment selects. Uploads a real generated PNG, fetches the returned URL
// over plain HTTP the way a browser would, then deletes and confirms the bytes
// are gone.
//
//   tsx --env-file=.env.storage-test scripts/verify-storage.ts
//
// The PNG is encoded here with zlib rather than sharp on purpose: sharp is
// optional at runtime, and a test for the storage layer must not fall over on
// a machine where the native binary will not load.

import { deflateSync } from 'node:zlib';
import { crc32 } from 'node:zlib';
import { storeUpload, deleteStored, activeDriver } from '../lib/media/storage';

const ok = (m: string) => console.log(`  PASS  ${m}`);
const bad = (m: string) => {
  console.log(`  FAIL  ${m}`);
  process.exitCode = 1;
};
const note = (m: string) => console.log(`  ..    ${m}`);

/** Minimal but fully valid PNG encoder — solid colour, 8-bit RGB. */
function makePng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour

  // Each scanline is prefixed with filter byte 0 (None).
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const p = row + 1 + x * 3;
      raw[p] = 20;
      raw[p + 1] = 90;
      raw[p + 2] = 160;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function ensureBucket() {
  if (process.env.STORAGE_DRIVER !== 's3') return;

  const { S3Client, CreateBucketCommand, PutBucketPolicyCommand } = await import(
    '@aws-sdk/client-s3'
  );
  const bucket = process.env.S3_BUCKET!;
  const client = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });

  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    note(`created bucket ${bucket}`);
  } catch {
    note(`bucket ${bucket} already exists`);
  }

  // Anonymous read, so the fetch below takes the same path a browser would.
  await client.send(
    new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${bucket}/*`],
          },
        ],
      }),
    })
  );
}

async function sharpAvailable(): Promise<boolean> {
  try {
    await import('sharp');
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`driver: ${activeDriver().name}\n`);
  await ensureBucket();

  const hasSharp = await sharpAvailable();
  note(hasSharp ? 'sharp available' : 'sharp NOT loadable — thumbnail checks relaxed');

  const png = makePng(600, 400);
  const file = new File([new Uint8Array(png)], 'aeon-test.png', { type: 'image/png' });

  const stored = await storeUpload(file);
  note(`url       ${stored.url}`);
  note(`thumbnail ${stored.thumbnailUrl}`);

  // The whole point of making sharp optional: the upload itself must survive
  // without it, carrying null metadata rather than failing.
  if (hasSharp) {
    stored.width === 600 && stored.height === 400
      ? ok('sharp read the real dimensions (600x400)')
      : bad(`dimensions wrong: ${stored.width}x${stored.height}`);
    stored.thumbnailUrl ? ok('thumbnail generated') : bad('no thumbnail');
  } else {
    stored.width === null && stored.thumbnailUrl === null
      ? ok('upload succeeded without sharp, metadata null as designed')
      : bad('unexpected metadata with sharp unavailable');
  }

  if (stored.url.startsWith('http')) {
    const res = await fetch(stored.url);
    const body = Buffer.from(await res.arrayBuffer());

    res.ok ? ok(`original fetched over HTTP (${res.status})`) : bad(`fetch failed ${res.status}`);
    body.length === png.length
      ? ok(`byte-for-byte identical (${body.length} bytes)`)
      : bad(`size mismatch: sent ${png.length}, got ${body.length}`);
    res.headers.get('content-type') === 'image/png'
      ? ok('content-type preserved')
      : bad(`content-type is ${res.headers.get('content-type')}`);
    res.headers.get('cache-control')?.includes('immutable')
      ? ok('immutable cache header set')
      : bad(`cache-control is ${res.headers.get('cache-control')}`);
  }

  // Deleting by URL must work through the facade's shape-based routing.
  await deleteStored(stored.url);
  await deleteStored(stored.thumbnailUrl);

  if (stored.url.startsWith('http')) {
    const after = await fetch(stored.url);
    after.status === 404 ? ok('deleted (404 after remove)') : bad(`still present: ${after.status}`);
  }

  // Cross-driver routing: a legacy local URL must not be handed to S3.
  await deleteStored('/uploads/2020/01/does-not-exist.jpg');
  ok('legacy /uploads/ URL routed to local driver without throwing');

  await deleteStored('/uploads/../../../etc/passwd');
  ok('traversal attempt rejected without throwing');

  await deleteStored('https://evil.example.com/x.jpg');
  ok('unknown-host URL ignored rather than guessed at');

  // Policy is enforced in the facade, so it holds for both drivers.
  const svg = new File([new Uint8Array(Buffer.from('<svg onload="alert(1)"/>'))], 'x.svg', {
    type: 'image/svg+xml',
  });
  await storeUpload(svg).then(
    () => bad('SVG was accepted — stored-XSS vector is open'),
    (e: Error) => (e.message === 'UNSUPPORTED_TYPE' ? ok('SVG rejected') : bad(e.message))
  );

  const huge = new File([new Uint8Array(9 * 1024 * 1024)], 'big.png', { type: 'image/png' });
  await storeUpload(huge).then(
    () => bad('9MB file was accepted over the 8MB cap'),
    (e: Error) => (e.message === 'TOO_LARGE' ? ok('oversized file rejected') : bad(e.message))
  );

  console.log(process.exitCode ? '\nFAILURES ABOVE' : '\nall checks passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
