import type { Metadata } from "next";
import { PlayerGame } from "@/components/player/PlayerGame";

export const metadata: Metadata = { title: "Lobi" };

export default async function PlayerLobbyPage({ params }: PageProps<"/room/[code]/lobby">) {
  const { code } = await params;
  return <PlayerGame roomCode={code} />;
}
