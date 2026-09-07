// lib/themes/limits.ts
/** Caps for uploaded HTML theme zips — zip-bomb and path-traversal defence. */

export const MAX_THEME_ZIP_BYTES = 8 * 1024 * 1024; // 8 MB compressed
export const MAX_THEME_UNCOMPRESSED_BYTES = 24 * 1024 * 1024; // 24 MB total
export const MAX_THEME_FILES = 200;
export const MAX_THEME_FILE_BYTES = 2 * 1024 * 1024; // 2 MB per file

/** Extensions allowed inside a pack. No PHP, no server scripts. */
export const THEME_ALLOWED_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.css',
  '.js',
  '.json',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.woff',
  '.woff2',
  '.ttf',
  '.txt',
  '.md',
]);
