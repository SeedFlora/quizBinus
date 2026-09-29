import type { Metadata } from "next";
import { PlayerGame } from "@/components/player/PlayerGame";

export const metadata: Metadata = { title: "Arena" };

export default async function Page({ params }: PageProps<"/play/[sessionId]">) {
  const { sessionId } = await params;
  return <PlayerGame sessionId={sessionId} />;
}
