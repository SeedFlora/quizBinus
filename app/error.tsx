"use client";

import { useEffect } from "react";
import { Home, RotateCcw } from "lucide-react";
import { NusaButton, NusaLink } from "@/components/ui/NusaButton";
import { KawungGap, StageFallback } from "@/components/ui/StageFallback";
import { useT } from "@/lib/i18n/client";

/**
 * Error boundary for every route below the root layout. `retry` re-fetches and
 * re-renders the segment; players who retry are resumed by their stored credentials.
 */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useT();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StageFallback
      glyph={<KawungGap variant="loose" />}
      title={t("errors.generic")}
      body={t("design.fallback.errorBody")}
      actions={
        <>
          <NusaButton size="lg" onClick={() => retry()} icon={<RotateCcw size={18} aria-hidden="true" />}>
            {t("common.retry")}
          </NusaButton>
          <NusaLink href="/" size="lg" variant="ghost" icon={<Home size={18} aria-hidden="true" />}>
            {t("errors.notFoundCta")}
          </NusaLink>
        </>
      }
      footnote={
        error.digest ? (
          <p className="mt-10 text-sm text-stage-faint">
            {t("design.fallback.reference")}: <code className="font-mono text-stage-muted">{error.digest}</code>
          </p>
        ) : null
      }
    />
  );
}
