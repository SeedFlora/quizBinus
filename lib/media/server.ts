import { z } from "zod";
import { resizeImage } from "./resize";
import { MediaError, MEDIA_LIMITS, type MediaUploader, type UploadedMedia } from "./types";

/** What POST /api/media answers: a same-origin path to the stored file. */
const UploadResponse = z.object({ url: z.string().regex(/^\/api\/media\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/) });

/**
 * Database-mode uploader: the image is resized in the browser, then stored by the
 * app itself (POST /api/media, multipart field "file") on the UPLOAD_DIR volume.
 * The returned `/api/media/<file>` path is same-origin, so projector and phones
 * load it from the same server that runs the game.
 */
export class ServerMediaUploader implements MediaUploader {
  readonly kind = "server" as const;

  async upload(file: File): Promise<UploadedMedia> {
    const resized = await resizeImage(file, MEDIA_LIMITS.maxUploadBytes);
    const form = new FormData();
    const ext = resized.mime === "image/webp" ? "webp" : "jpg";
    form.append("file", new File([resized.blob], `image.${ext}`, { type: resized.mime }));

    let res: Response;
    try {
      res = await fetch("/api/media", { method: "POST", body: form, credentials: "same-origin" });
    } catch {
      throw new MediaError("upload_failed", "network");
    }
    if (res.status === 401 || res.status === 403) throw new MediaError("not_signed_in");
    if (res.status === 413) throw new MediaError("too_large");
    if (res.status === 415) throw new MediaError("not_image");
    if (!res.ok) throw new MediaError("upload_failed", `status ${res.status}`);

    const parsed = UploadResponse.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new MediaError("upload_failed", "unexpected response");
    return {
      url: parsed.data.url,
      width: resized.width,
      height: resized.height,
      bytes: resized.blob.size,
      mime: resized.mime,
    };
  }

  async remove(): Promise<void> {
    // Kept on purpose: the quiz snapshots of past sessions may still show this image
    // in their reports. Files are small; an admin can prune UPLOAD_DIR if ever needed.
  }
}
