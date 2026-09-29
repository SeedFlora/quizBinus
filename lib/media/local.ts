import { blobToDataUrl, resizeImage } from "./resize";
import { MEDIA_LIMITS, type MediaUploader, type UploadedMedia } from "./types";

/** Base64 inflates by 4/3; leave room for the "data:image/webp;base64," prefix. */
const MAX_BLOB_BYTES = Math.floor(((MEDIA_LIMITS.maxDataUrlBytes - 64) * 3) / 4);

/**
 * Memory-mode uploader: nothing is stored on the server. The image is resized and
 * kept inline as a data URL on the question, so it travels with the quiz in
 * localStorage and inside the quiz sent to the game server when a session starts.
 */
export class LocalMediaUploader implements MediaUploader {
  readonly kind = "local" as const;

  async upload(file: File): Promise<UploadedMedia> {
    const resized = await resizeImage(file, MAX_BLOB_BYTES);
    const url = await blobToDataUrl(resized.blob);
    return { url, width: resized.width, height: resized.height, bytes: resized.blob.size, mime: resized.mime };
  }

  async remove(): Promise<void> {
    /* inline data: nothing to clean up */
  }
}
