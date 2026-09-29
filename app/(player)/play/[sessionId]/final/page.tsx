import type { Metadata } from "next";
import { PlayerGame } from "@/components/player/PlayerGame";

export const metadata: Metadata = { title: "Hasil akhir" };

export default async function Page({ params }: PageProps<"/play/[sessionId]/final">) {
  const { sessionId } = await params;
  return <PlayerGame sessionId={sessionId} />;
}
