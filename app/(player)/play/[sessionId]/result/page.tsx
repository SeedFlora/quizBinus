import type { Metadata } from "next";
import { PlayerGame } from "@/components/player/PlayerGame";

export const metadata: Metadata = { title: "Hasil" };

export default async function Page({ params }: PageProps<"/play/[sessionId]/result">) {
  const { sessionId } = await params;
  return <PlayerGame sessionId={sessionId} />;
}
