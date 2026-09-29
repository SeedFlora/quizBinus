import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { serverEnv } from "@/lib/env.server";

/**
 * Uploaded question images on the UPLOAD_DIR volume (database mode).
 *
 * - Only PNG, JPEG, WebP and GIF, recognised by their magic bytes (the browser's
 *   Content-Type and the file name are ignored). No SVG: it can carry script.
 * - Stored under a random name (128 bits + the sniffed extension), so a name is both
 *   unguessable and safe: GET /api/media/[file] only accepts that exact pattern and
 *   resolves it strictly inside the upload directory.
 */

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export type ImageExt = "png" | "jpg" | "webp" | "gif";

export const IMAGE_MIME: Record<ImageExt, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export const MEDIA_FILE_PATTERN = /^[a-f0-9]{32}\.(png|jpg|webp|gif)$/;

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b);
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/** The image type from the file's first bytes, or null for anything else. */
export function sniffImage(bytes: Uint8Array): ImageExt | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith(bytes, ascii("GIF87a")) || startsWith(bytes, ascii("GIF89a"))) return "gif";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "webp";
  return null;
}

/**
 * Absolute path of a stored file, or null when the name is not one we issued (path
 * traversal, other extensions, encoded separators all fail the pattern) or would
 * resolve outside the upload directory.
 */
export function resolveMediaPath(fileName: string, dir = serverEnv.uploadDir): string | null {
  if (!MEDIA_FILE_PATTERN.test(fileName)) return null;
  const root = path.resolve(dir);
  const full = path.resolve(root, fileName);
  if (path.dirname(full) !== root) return null;
  return full;
}

export interface StoredMedia {
  fileName: string;
  mime: string;
  bytes: number;
}

// `turbopackIgnore` on the fs calls: these are runtime paths on the UPLOAD_DIR volume,
// never build inputs. Without it, output tracing copies the whole project into the
// standalone server (and the Docker image).

/** Validates and writes an upload. Throws MediaError("too_large" | "unsupported_type" | "empty"). */
export async function storeMedia(data: Uint8Array, dir = serverEnv.uploadDir): Promise<StoredMedia> {
  if (data.byteLength === 0) throw new MediaError("empty");
  if (data.byteLength > MAX_UPLOAD_BYTES) throw new MediaError("too_large");
  const ext = sniffImage(data);
  if (!ext) throw new MediaError("unsupported_type");
  const fileName = `${randomBytes(16).toString("hex")}.${ext}`;
  const full = resolveMediaPath(fileName, dir)!;
  await mkdir(/*turbopackIgnore: true*/ path.dirname(full), { recursive: true });
  // "wx": never overwrite (a 128-bit collision would be a bug worth failing on).
  await writeFile(/*turbopackIgnore: true*/ full, data, { flag: "wx" });
  return { fileName, mime: IMAGE_MIME[ext], bytes: data.byteLength };
}

export async function readMedia(
  fileName: string,
  dir = serverEnv.uploadDir,
): Promise<{ data: Buffer; mime: string } | null> {
  const full = resolveMediaPath(fileName, dir);
  if (!full) return null;
  try {
    const data = await readFile(/*turbopackIgnore: true*/ full);
    const ext = fileName.slice(fileName.lastIndexOf(".") + 1) as ImageExt;
    return { data, mime: IMAGE_MIME[ext] };
  } catch {
    return null;
  }
}

export async function removeMedia(fileName: string, dir = serverEnv.uploadDir): Promise<void> {
  const full = resolveMediaPath(fileName, dir);
  if (full) await unlink(/*turbopackIgnore: true*/ full).catch(() => undefined);
}

export class MediaError extends Error {
  constructor(readonly code: "too_large" | "unsupported_type" | "empty") {
    super(code);
  }
}
