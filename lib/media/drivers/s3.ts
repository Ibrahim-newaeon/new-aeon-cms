// lib/media/drivers/s3.ts
import type { S3Client } from '@aws-sdk/client-s3';
import type { StorageDriver } from './types';

/**
 * S3-compatible driver — AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces, B2.
 *
 * One driver rather than one per vendor: they all speak the same API, and the
 * only real differences are the endpoint and whether path-style addressing is
 * required. Both are env vars.
 */

interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string;
  publicUrl: string;
  forcePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
}

let cachedClient: S3Client | null = null;
let cachedConfig: S3Config | null = null;

function readConfig(): S3Config {
  if (cachedConfig) return cachedConfig;

  const bucket = process.env.S3_BUCKET ?? '';
  const region = process.env.S3_REGION || 'auto';
  const endpoint = process.env.S3_ENDPOINT || undefined;

  // The bucket is almost always *read* through a CDN or an r2.dev / custom
  // domain, not through the API endpoint that writes it. Deriving the public
  // base from the endpoint is only a fallback for MinIO-style setups.
  const publicUrl = (
    process.env.S3_PUBLIC_URL ||
    (endpoint ? `${endpoint.replace(/\/+$/, '')}/${bucket}` : `https://${bucket}.s3.${region}.amazonaws.com`)
  ).replace(/\/+$/, '');

  cachedConfig = {
    bucket,
    region,
    endpoint,
    publicUrl,
    // R2 and MinIO need path-style; AWS does not. Default follows the endpoint:
    // a custom endpoint almost always means a non-AWS backend.
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE
      ? process.env.S3_FORCE_PATH_STYLE === 'true'
      : Boolean(endpoint),
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  };

  return cachedConfig;
}

/**
 * The SDK is loaded lazily. A developer running STORAGE_DRIVER=local should not
 * pay ~2MB of client construction at boot for a driver they never call, and
 * this module is imported unconditionally by the storage facade.
 */
async function getClient(): Promise<S3Client> {
  if (cachedClient) return cachedClient;

  const cfg = readConfig();
  const { S3Client: Client } = await import('@aws-sdk/client-s3');

  cachedClient = new Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: cfg.forcePathStyle,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });

  return cachedClient;
}

export const s3Driver: StorageDriver = {
  name: 's3',

  async put(key, body, contentType) {
    const cfg = readConfig();
    const client = await getClient();
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');

    await client.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Safe to cache forever: the key carries a UUID and is never rewritten.
        // A changed image is a new upload with a new key.
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );

    return `${cfg.publicUrl}/${key}`;
  },

  async remove(url) {
    if (!this.owns(url)) return;

    const cfg = readConfig();
    const key = url.slice(cfg.publicUrl.length + 1);
    if (!key) return;

    const client = await getClient();
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');

    try {
      await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
    } catch (error) {
      // Matches the local driver: a missing object must not block the row
      // delete. Anything else is worth seeing in the logs.
      console.error('S3 delete failed:', url, error);
    }
  },

  owns(url) {
    const cfg = readConfig();
    return Boolean(cfg.publicUrl) && url.startsWith(`${cfg.publicUrl}/`);
  },
};

/** Test/script hook — drops the memoised client so env changes take effect. */
export function resetS3Cache(): void {
  cachedClient = null;
  cachedConfig = null;
}
