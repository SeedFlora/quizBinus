import type { ReactNode } from "react";
import { CreatorShell } from "@/components/creator/CreatorShell";
import { getCreatorProfile } from "@/components/creator/profile";
import { isDatabaseConfigured } from "@/lib/env.server";

export default async function CreatorLayout({ children }: { children: ReactNode }) {
  // Same source as the dashboard greeting and Settings, so a saved profile shows in the rail too.
  const profile = await getCreatorProfile();
  return (
    <CreatorShell
      storage={isDatabaseConfigured() ? "database" : "browser"}
      lecturer={{ name: profile.fullName, salutation: profile.salutation, email: profile.email }}
    >
      {children}
    </CreatorShell>
  );
}
