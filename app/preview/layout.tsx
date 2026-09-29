import type { Metadata } from "next";
import type { ReactNode } from "react";

/** Design-review fixtures: never indexed, never linked from the product. */
export const metadata: Metadata = {
  title: { default: "Pratinjau layar", template: "%s · Pratinjau" },
  robots: { index: false, follow: false },
};

export default function PreviewLayout({ children }: { children: ReactNode }) {
  return children;
}
