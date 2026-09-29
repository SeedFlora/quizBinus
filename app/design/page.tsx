import type { Metadata } from "next";
import { DesignGallery } from "@/components/dev/gallery/DesignGallery";

/** Team reference for lecturers/hosts and designers: never indexed, never linked from player flows. */
export const metadata: Metadata = {
  title: "Sistem desain",
  robots: { index: false, follow: false },
};

export default function DesignPage() {
  return <DesignGallery />;
}
