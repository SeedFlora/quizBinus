import type { Metadata } from "next";
import { PlayerGame } from "@/components/player/PlayerGame";

export const metadata: Metadata = { title: "Jawaban terkunci" };

export default async function Page({ params }: PageProps<"/play/[sessionId]/waiting">) {
  const { sessionId } = await params;
  return <PlayerGame sessionId={sessionId} />;
}
