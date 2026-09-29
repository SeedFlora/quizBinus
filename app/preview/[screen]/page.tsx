import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PreviewStage } from "@/components/dev/preview/PreviewStage";
import { buildFixture, parsePreviewQuery } from "@/components/dev/preview/fixtures";
import { isPreviewScreen } from "@/components/dev/preview/screens";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata({ params }: PageProps<"/preview/[screen]">): Promise<Metadata> {
  const { screen } = await params;
  if (!isPreviewScreen(screen)) return {};
  const t = await getT();
  return {
    title: `${t(`design.preview.screens.${screen}`)} (${screen.startsWith("host-") ? t("design.preview.host") : t("design.preview.player")})`,
  };
}

/** One core screen rendered from a real engine fixture, e.g. /preview/host-podium?stress=1. */
export default async function PreviewScreenPage({ params, searchParams }: PageProps<"/preview/[screen]">) {
  const { screen } = await params;
  // Deliberate failure so app/error.tsx can be reviewed like any other screen.
  if (screen === "error-boundary") throw new Error("Preview fixture: error boundary");
  if (!isPreviewScreen(screen)) notFound();
  const fixture = buildFixture(screen, parsePreviewQuery(await searchParams));
  return <PreviewStage fixture={fixture} />;
}
