import { apiRoute, respond } from "@/lib/server/http";
import { assertSameOrigin } from "@/lib/server/csrf";
import { creatorLecturer, uploadMedia } from "@/lib/server/creator-api";

/**
 * POST /api/media (multipart, field "file") → 201 { url: "/api/media/<file>" }.
 * Database mode, signed-in lecturer. PNG / JPEG / WebP / GIF up to 2 MB, checked by
 * magic bytes and stored under a random name on the UPLOAD_DIR volume.
 */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const auth = await creatorLecturer();
  if (!auth.ok) return respond(auth.res);
  return respond(await uploadMedia(request, auth.lecturer));
});
