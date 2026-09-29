import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isDatabaseConfigured } from "@/lib/env.server";
import { DEMO_LECTURER } from "@/lib/seed/quizzes";
import { REQUEST_PATH_HEADER } from "./proxy-rules";
import { safeNextPath } from "./redirect";
import { getAuthUser, type AuthUser } from "./session";

export interface Lecturer {
  id: string;
  fullName: string;
  salutation: string;
  email?: string;
  role: "admin" | "lecturer";
  /** "demo" in memory mode (no sign-in); "db" for a signed-in database account. */
  source: "demo" | "db";
}

function demoLecturer(): Lecturer {
  return {
    id: DEMO_LECTURER.id,
    fullName: DEMO_LECTURER.fullName,
    salutation: DEMO_LECTURER.salutation,
    email: DEMO_LECTURER.email,
    role: "lecturer",
    source: "demo",
  };
}

function fromUser(user: AuthUser): Lecturer {
  return {
    id: user.id,
    fullName: user.fullName,
    salutation: user.salutation,
    email: user.email,
    role: user.role,
    source: "db",
  };
}

/**
 * The lecturer for creator/host PAGES.
 * - Memory mode (no DATABASE_URL): the demo lecturer, no sign-in needed.
 * - Database mode: the signed-in lecturer; otherwise redirects to /login with a
 *   `next` back-link (proxy.ts usually redirects earlier, when there is no cookie).
 */
export async function getLecturer(): Promise<Lecturer> {
  if (!isDatabaseConfigured()) return demoLecturer();
  const user = await getAuthUser();
  if (user) return fromUser(user);
  // proxy.ts forwards the requested path; without it, land on the default page.
  const next = safeNextPath((await headers()).get(REQUEST_PATH_HEADER), "");
  redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
}

/**
 * The lecturer for ROUTE HANDLERS: never redirects. The demo lecturer in memory
 * mode; in database mode the signed-in lecturer or null (respond 401).
 */
export async function getLecturerOrNull(): Promise<Lecturer | null> {
  if (!isDatabaseConfigured()) return demoLecturer();
  const user = await getAuthUser();
  return user ? fromUser(user) : null;
}
