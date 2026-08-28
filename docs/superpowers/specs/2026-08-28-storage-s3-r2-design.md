# Storage — S3 / R2 object storage

**Date:** 2026-08-28
**Status:** Complete
**Depends on:** nothing. Blocks: any deploy that must keep uploaded media.

## Problem

`lib/media/storage.ts` writes uploads to `./public/uploads` and returns
`/uploads/<yyyy>/<mm>/<uuid>.<ext>`. That path lives inside the build output. On
any containerised or serverless deploy the filesystem is ephemeral, so **every
image an editor uploads is destroyed on the next deploy**, while the
`media_assets` row survives and keeps pointing at the missing bytes.

Fixing this after real orders exist is far more expensive, which is why it was
sequenced ahead of C0 and C3.

## Decision

Introduce a **driver** behind the existing public API. `storeUpload()` and
`deleteStored()` keep their exact signatures, so the two API routes that call
them do not change.

```
lib/media/
  storage.ts          facade — validation, sharp, key generation, driver dispatch
  drivers/types.ts    StorageDriver interface + StoredObject
  drivers/local.ts    today's behaviour, unchanged semantics
  drivers/s3.ts       S3-compatible: AWS S3, Cloudflare R2, MinIO, Spaces
```

The driver's job is deliberately narrow: **move bytes, produce a URL, delete by
URL.** Everything policy-shaped — the MIME allow-list, the 8 MB cap, the
UUID-generated filename, the 400px webp thumbnail — stays in the facade so the
two drivers cannot drift apart on the security-relevant decisions.

### Why one S3 driver rather than an R2 driver and an S3 driver

R2, MinIO, Spaces and B2 all speak the S3 API. The only differences are the
endpoint and whether path-style addressing is required. Two env vars cover it;
a second driver would be duplicated code with a different constructor.

### Driver selection

`STORAGE_DRIVER=local | s3`, defaulting to `local`. Default matters: a developer
who pulls this branch and runs `npm run dev` must not need R2 credentials.

### Key layout

Unchanged from local: `<yyyy>/<mm>/<uuid>.<ext>`. Keeping the date prefix means
an existing `public/uploads` tree can be copied into a bucket verbatim, and the
migration script does exactly that.

### URL shape and the mixed-content problem

This is the part that is easy to get wrong. After the switch to `s3`, the
database still holds thousands of rows whose `url` is `/uploads/2026/07/x.jpg`.
Those files may or may not have been migrated.

So `deleteStored()` **routes on the URL, not on the configured driver**: a URL
beginning `/uploads/` always goes to the local driver, anything matching the
configured public base goes to S3. A URL matching neither is ignored rather than
guessed at. Without this, switching drivers would silently orphan every
pre-existing file, and — worse — a path-traversal check written for one shape
would be applied to the other.

`S3_PUBLIC_URL` is separate from `S3_ENDPOINT` because the bucket is usually
read through a CDN or an `r2.dev` / custom domain, not through the API endpoint
that writes it. When unset it is derived from endpoint + bucket.

### Env validation

`lib/env.ts` throws at boot on invalid config, and that behaviour is kept. The
S3 fields are conditionally required via `superRefine`: they are optional when
the driver is `local` and mandatory when it is `s3`. A half-configured bucket
should stop the process at boot, not surface as a 500 on the editor's first
upload.

### Caching

Objects are written with `CacheControl: public, max-age=31536000, immutable`.
Safe because the key contains a UUID and is never rewritten — a changed image is
a new upload with a new key.

### Not in scope

- Signed private URLs. All media here is public site content.
- Direct browser-to-bucket presigned uploads. Would remove the 8 MB server limit
  and the Vercel body cap, but it moves MIME validation to the client, and the
  server would have to re-fetch each object to thumbnail it. Revisit if large
  video is ever needed.
- Deleting the local files after migration. The script copies; removing the
  originals is a manual step once the bucket is verified.

## Migration

`scripts/migrate-media-to-s3.ts` walks `media_assets`, uploads every row still
pointing at `/uploads/`, and rewrites `url` / `thumbnailUrl` to the bucket. It
is idempotent (a row already on the bucket is skipped) and supports `--dry-run`.

## Verification

1. `STORAGE_DRIVER=local` — upload, thumbnail, delete still work unchanged.
2. `STORAGE_DRIVER=s3` against MinIO — upload lands in the bucket, the returned
   URL renders, delete removes both object and thumbnail.
3. Boot with `STORAGE_DRIVER=s3` and a missing `S3_BUCKET` — process refuses to
   start with a named field.
4. Migration script `--dry-run` then live, then confirm old `/uploads/` rows now
   render from the bucket.
