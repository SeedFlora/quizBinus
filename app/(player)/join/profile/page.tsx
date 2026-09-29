import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileScreen } from "@/components/player/ProfileScreen";

export const metadata: Metadata = { title: "Nama Arena" };

export default function ProfilePage() {
  return (
    <Suspense>
      <ProfileScreen />
    </Suspense>
  );
}
