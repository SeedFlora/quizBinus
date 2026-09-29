/**
 * Question media upload contract. The editor only knows `MediaUploader`; which
 * backend stores the bytes is decided by getMediaUploader() (lib/media/index.ts).
 */

export interface UploadedMedia {
  /** /api/media/<file> (database mode) or a data: URL (memory mode). Goes into Question.mediaUrl. */
  url: string;
  width: number;
  height: number;
  /** Encoded size in bytes of the stored image. */
  bytes: number;
  mime: "image/webp" | "image/jpeg";
}

export interface MediaUploadContext {
  quizId: string;
}

export interface MediaUploader {
  readonly kind: "local" | "server";
  upload(file: File, context: MediaUploadContext): Promise<UploadedMedia>;
  /** Best-effort cleanup when an image is replaced or removed. */
  remove(url: string): Promise<void>;
}

export type MediaErrorCode = "not_image" | "too_large" | "decode_failed" | "not_signed_in" | "upload_failed";

export class MediaError extends Error {
  constructor(
    readonly code: MediaErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "MediaError";
  }
}

export const MEDIA_LIMITS = {
  /** Longest edge after resizing. */
  maxEdge: 1280,
  /** Reject absurd originals before decoding (phones produce ~5–12 MB photos). */
  maxInputBytes: 20 * 1024 * 1024,
  /**
   * Memory mode keeps images inline: in localStorage, and inside every live snapshot
   * the game server sends to each phone while the question is up. Keep them light.
   */
  maxDataUrlBytes: 160 * 1024,
  /**
   * Upload size after resizing (the server accepts up to 2 MB). Every phone in the
   * room downloads the image when the question opens, so small beats sharp.
   */
  maxUploadBytes: 400 * 1024,
  accept: "image/png,image/jpeg,image/webp,image/gif,image/avif",
} as const;
