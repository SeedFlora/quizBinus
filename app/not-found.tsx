import { Home } from "lucide-react";
import { NusaLink } from "@/components/ui/NusaButton";
import { KawungGap, StageFallback } from "@/components/ui/StageFallback";
import { getT } from "@/lib/i18n/server";

/** Unmatched URLs and notFound(): a kawung with one petal missing. */
export default async function NotFound() {
  const t = await getT();
  return (
    <StageFallback
      ghost="404"
      eyebrow="404"
      glyph={<KawungGap variant="missing" />}
      title={t("errors.notFound")}
      body={t("design.fallback.notFoundBody")}
      actions={
        <>
          <NusaLink href="/join" size="lg">
            {t("join.cta")}
          </NusaLink>
          <NusaLink href="/" size="lg" variant="ghost" icon={<Home size={18} aria-hidden="true" />}>
            {t("errors.notFoundCta")}
          </NusaLink>
        </>
      }
    />
  );
}
