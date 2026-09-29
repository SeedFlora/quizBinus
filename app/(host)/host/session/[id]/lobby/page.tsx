import type { Metadata } from "next";
import { HostStage } from "@/components/host/HostStage";

export const metadata: Metadata = { title: "Lobi arena" };

export default async function Page({ params }: PageProps<"/host/session/[id]/lobby">) {
  const { id } = await params;
  return <HostStage sessionId={id} />;
}
