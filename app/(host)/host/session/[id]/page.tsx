import type { Metadata } from "next";
import { HostStage } from "@/components/host/HostStage";

export const metadata: Metadata = { title: "Layar utama" };

export default async function Page({ params }: PageProps<"/host/session/[id]">) {
  const { id } = await params;
  return <HostStage sessionId={id} />;
}
