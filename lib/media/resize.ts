/**
 * Client-side image downscaling: fit inside `maxEdge`, re-encode as WebP (JPEG when
 * the browser can't encode WebP), and step quality/size down until the result fits
 * `maxBytes`. Runs in the browser only.
 */

import { MediaError, MEDIA_LIMITS } from "./types";

export interface ResizedImage {
  blob: Blob;
  width: number;
  height: number;
  mime: "image/webp" | "image/jpeg";
}

const QUALITIES = [0.86, 0.78, 0.68, 0.58, 0.48];

async function decode(
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      /* fall through to <img> (e.g. older Safari with some formats) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new MediaError("decode_failed");
  }
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

export async function resizeImage(
  file: File,
  maxBytes: number,
  maxEdge: number = MEDIA_LIMITS.maxEdge,
): Promise<ResizedImage> {
  if (!file.type.startsWith("image/")) throw new MediaError("not_image");
  if (file.size > MEDIA_LIMITS.maxInputBytes) throw new MediaError("too_large");

  const image = await decode(file);
  try {
    if (!image.width || !image.height) throw new MediaError("decode_failed");
    let scale = Math.min(1, maxEdge / Math.max(image.width, image.height));

    // Up to three size steps × five quality steps; photos almost always fit in the first few.
    for (let sizeStep = 0; sizeStep < 3; sizeStep++) {
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new MediaError("decode_failed");
      ctx.imageSmoothingQuality = "high";

      for (const mime of ["image/webp", "image/jpeg"] as const) {
        if (mime === "image/jpeg") {
          // JPEG has no alpha: flatten transparent PNGs onto white instead of black.
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
        } else {
          ctx.clearRect(0, 0, width, height);
        }
        ctx.drawImage(image.source, 0, 0, width, height);

        for (const quality of QUALITIES) {
          const blob = await toBlob(canvas, mime, quality);
          // Browsers that can't encode WebP silently return PNG: move on to JPEG.
          if (!blob || blob.type !== mime) break;
          if (blob.size <= maxBytes) return { blob, width, height, mime };
        }
      }
      scale *= 0.75;
    }
    throw new MediaError("too_large");
  } finally {
    image.close();
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new MediaError("decode_failed"));
    reader.readAsDataURL(blob);
  });
}
