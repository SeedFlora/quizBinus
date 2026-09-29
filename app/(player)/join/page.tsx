import type { Metadata } from "next";
import { Suspense } from "react";
import { JoinScreen } from "@/components/player/JoinScreen";

export const metadata: Metadata = { title: "Masuk Arena" };

export default function JoinPage() {
  return (
    <Suspense>
      <JoinScreen />
    </Suspense>
  );
}
