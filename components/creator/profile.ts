import "server-only";
import { cookies } from "next/headers";
import { getLecturer, type Lecturer } from "@/lib/auth/lecturer";
import { PROFILE_COOKIE, profileSchema } from "./profile-schema";

/**
 * The lecturer as creator pages (and the creator layout's rail) present them.
 * Database mode: the signed-in account, read fresh per request, so a saved profile
 * shows everywhere at once. Memory mode has no account to update: edits made in
 * Settings live in a cookie and are applied on top of the demo lecturer here.
 */
export async function getCreatorProfile(): Promise<Lecturer> {
  const lecturer = await getLecturer();
  if (lecturer.source !== "demo") return lecturer;
  const raw = (await cookies()).get(PROFILE_COOKIE)?.value;
  if (!raw) return lecturer;
  try {
    const parsed = profileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? { ...lecturer, ...parsed.data } : lecturer;
  } catch {
    return lecturer;
  }
}
