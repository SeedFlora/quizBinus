/**
 * Picks the media backend for where the creator keeps its data:
 *   - database → ServerMediaUploader (POST /api/media, files on the UPLOAD_DIR volume)
 *   - browser  → LocalMediaUploader (resized inline data URL, memory mode)
 */

import { LocalMediaUploader } from "./local";
import { ServerMediaUploader } from "./server";
import type { MediaUploader } from "./types";

export type MediaStorage = "database" | "browser";

let server: ServerMediaUploader | null = null;
let local: LocalMediaUploader | null = null;

export function getMediaUploader(storage: MediaStorage): MediaUploader {
  if (storage === "database") return (server ??= new ServerMediaUploader());
  return (local ??= new LocalMediaUploader());
}

export * from "./types";
