import type { Metadata } from "next";
import { requestNow } from "@/components/creator/format";
import { SessionHistory } from "@/components/creator/sessions/SessionHistory";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("sessions.metaTitle") };
}

export default async function SessionsPage({ searchParams }: PageProps<"/sessions">) {
  const { focus } = await searchParams;
  const focusId = typeof focus === "string" && focus.length <= 64 ? focus : null;
  return <SessionHistory now={requestNow()} focusId={focusId} />;
}
