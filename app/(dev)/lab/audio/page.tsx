import type { Metadata } from "next";
import { SoundLab } from "@/components/dev/SoundLab";

export const metadata: Metadata = { title: "Sound lab", robots: { index: false } };

export default function SoundLabPage() {
  return <SoundLab />;
}
