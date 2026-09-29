"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { getLecturer } from "@/lib/auth/lecturer";
import { updateUser } from "@/lib/db/users";
import { PROFILE_COOKIE, profileSchema } from "./profile-schema";

export type SaveProfileState = { status: "idle" | "saved" | "invalid" | "failed"; at?: number };

/**
 * Settings → "Simpan profil". Validates at the boundary, then writes where the
 * profile lives: the signed-in account's users row (database mode; the id comes
 * from the session, never from the form), or a cookie on top of the demo lecturer
 * (memory mode). Either way the layout re-renders, so the rail shows the new name.
 */
export async function saveProfile(_prev: SaveProfileState, formData: FormData): Promise<SaveProfileState> {
  const parsed = profileSchema.safeParse({
    fullName: formData.get("fullName"),
    salutation: formData.get("salutation"),
  });
  if (!parsed.success) return { status: "invalid", at: Date.now() };

  // Database mode redirects to /login here when the sign-in has expired.
  const lecturer = await getLecturer();

  if (lecturer.source === "db") {
    try {
      const updated = await updateUser(lecturer.id, parsed.data);
      if (!updated) return { status: "failed", at: Date.now() };
    } catch (error) {
      console.error("[settings] profile update failed", error);
      return { status: "failed", at: Date.now() };
    }
    refresh();
    return { status: "saved", at: Date.now() };
  }

  (await cookies()).set(PROFILE_COOKIE, JSON.stringify(parsed.data), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
  });
  return { status: "saved", at: Date.now() };
}
