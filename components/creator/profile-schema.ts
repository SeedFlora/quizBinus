import { z } from "zod";

/** Shared by the settings form (client) and the save action (server). */
export const SALUTATIONS = ["Pak", "Bu"] as const;
export type Salutation = (typeof SALUTATIONS)[number];

export const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(60),
  salutation: z.enum(SALUTATIONS),
});

export type ProfileInput = z.infer<typeof profileSchema>;

/** Memory mode keeps profile edits in this cookie (no account to write to). */
export const PROFILE_COOKIE = "nq-profile";

/**
 * "Laras Wicaksono" → "Laras": dashboards greet by first name. Leading academic titles
 * are skipped ("Dr. Rina Wijaya" → "Rina", the documented ADMIN_NAME style) and a
 * trailing dot is dropped, so "Selamat datang, {name}." never ends in "..".
 */
export function firstName(fullName: string) {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const name = words.find((w) => !w.endsWith(".")) ?? words[0] ?? fullName;
  return name.replace(/\.+$/, "");
}

export function isSalutation(value: string): value is Salutation {
  return (SALUTATIONS as readonly string[]).includes(value);
}
