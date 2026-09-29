import { apiRoute, json } from "@/lib/server/http";
import { readMedia } from "@/lib/server/media-store";

/**
 * GET /api/media/[file] → the stored image. Public (players' phones load question
 * images), unguessable names, immutable: a new upload always gets a new name.
 */
export const GET = apiRoute(async (_request: Request, ctx: RouteContext<"/api/media/[file]">) => {
  const { file } = await ctx.params;
  const found = await readMedia(file);
  if (!found) return json({ error: "not_found" }, 404);
  return new Response(new Uint8Array(found.data), {
    status: 200,
    headers: {
      "Content-Type": found.mime,
      "Content-Length": String(found.data.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // An image opened directly must never run anything.
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Cross-Origin-Resource-Policy": "same-site",
    },
  });
});
