// lib/media/drivers/types.ts

/**
 * A storage driver moves bytes and nothing else.
 *
 * Everything security-relevant — the MIME allow-list, the size cap, the
 * generated filename, the thumbnail — lives in `lib/media/storage.ts` so the
 * drivers cannot drift apart on those decisions. A driver that starts making
 * policy choices is a bug.
 */
export interface StorageDriver {
  /** Stable identifier, used in logs and by the migration script. */
  readonly name: 'local' | 's3';

  /**
   * Writes `body` at `key` and returns the browser-facing URL.
   * `key` is always `<yyyy>/<mm>/<uuid>.<ext>` — no leading slash.
   */
  put(key: string, body: Buffer, contentType: string): Promise<string>;

  /**
   * Removes the object addressed by a URL this driver produced.
   * Must resolve rather than throw when the object is already gone: the caller
   * is deleting a database row and that outcome is still correct.
   */
  remove(url: string): Promise<void>;

  /**
   * True when `url` is one this driver produced. Used to route deletes by URL
   * shape rather than by the currently configured driver — after a switch to
   * s3 the database still holds `/uploads/...` rows that only the local driver
   * can clean up.
   */
  owns(url: string): boolean;
}
