// lib/media/limits.ts
/**
 * Upload policy: what may be uploaded and how large it may be.
 *
 * Separate from storage.ts because the ADMIN needs these numbers too — the
 * picker's `accept` list, and the panel telling an author what to prepare —
 * and storage.ts statically imports node:crypto, the local-disk driver and the
 * S3 SDK. Importing it from a client component would pull all of that into the
 * browser bundle.
 *
 * Pure data, no I/O, so both sides can share it and the limit an author is
 * shown is by construction the limit the server enforces.
 */

/**
 * Size caps, per kind.
 *
 * One number cannot serve both: 8 MB is generous for a hero image and far too
 * tight for even a short 1080p loop, so a single cap either bloats the library
 * or makes the slider's video option unusable. Raising it is a hosting decision
 * as much as a code one — an upload has to survive whatever proxy sits in front
 * of the app — so it is deliberately modest rather than unlimited.
 */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_VIDEO_BYTES = 24 * 1024 * 1024; // 24 MB

/** @deprecated Use maxBytesFor(). Kept so existing imports keep compiling. */
export const MAX_BYTES = MAX_IMAGE_BYTES;

/**
 * Allow-list, not a block-list. `image/svg+xml` is deliberately EXCLUDED: an SVG
 * is a document that can carry <script>, and it would be served same-origin from
 * our own domain — a stored-XSS vector dressed up as an image.
 *
 * mp4 and webm are here because the slider offers video slides. Without them
 * the media library could not produce a file that block accepts, which would
 * leave an option in the editor with nowhere to get its content.
 */
export const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
};

export const isImageMime = (mime: string) => mime.startsWith('image/');
export const isVideoMime = (mime: string) => mime.startsWith('video/');

export function maxBytesFor(mime: string): number {
  return isVideoMime(mime) ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
}

/**
 * The `accept` attribute for a file input, derived rather than restated.
 *
 * It used to be a hand-written copy of the keys below, so adding a type to the
 * allow-list left the picker refusing to show it — the server would have taken
 * the file the browser would not offer.
 */
export const UPLOAD_ACCEPT = Object.keys(ALLOWED_MIME).join(',');

/** Human-readable size, for telling an author what a limit actually means. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
