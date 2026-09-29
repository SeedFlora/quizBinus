import type { Metadata } from "next";
import { HostStage } from "@/components/host/HostStage";

export const metadata: Metadata = { title: "Podium" };

export default async function Page({ params }: PageProps<"/host/session/[id]/podium">) {
  const { id } = await params;
  return <HostStage sessionId={id} />;
}
