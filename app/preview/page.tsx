import Link from "next/link";
import { Monitor, Smartphone } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { StageBackground } from "@/components/brand/StageBackground";
import { NusaLink } from "@/components/ui/NusaButton";
import { NusaBadge } from "@/components/ui/NusaBadge";
import {
  PREVIEW_SCREENS,
  SURFACE_VIEWPORT,
  VARIANT_QUERY,
  type PreviewSurface,
} from "@/components/dev/preview/screens";
import { getT } from "@/lib/i18n/server";

/** Thumbnail scale per surface: six phones or three projectors per row at 1320px. */
const THUMB_SCALE: Record<PreviewSurface, number> = { player: 0.46, host: 0.2 };

/**
 * Contact sheet for design review: every fixture screen as a live, scaled-down
 * frame at its native viewport, with its variants one click away.
 */
export default async function PreviewIndexPage() {
  const t = await getT();
  const groups: Array<{ surface: PreviewSurface; label: string; icon: React.ReactNode }> = [
    { surface: "player", label: t("design.preview.player"), icon: <Smartphone size={18} aria-hidden="true" /> },
    { surface: "host", label: t("design.preview.host"), icon: <Monitor size={18} aria-hidden="true" /> },
  ];
  const number = new Map(PREVIEW_SCREENS.map((s, i) => [s.id, String(i + 1).padStart(2, "0")]));

  return (
    <div className="stage isolate min-h-dvh">
      <StageBackground pattern="grid" intensity="quiet" fade="center" />

      <header className="relative mx-auto flex max-w-[1320px] items-center justify-between gap-4 px-4 pt-6 sm:px-8 sm:pt-8">
        <Link href="/" className="rounded-sm">
          <Wordmark size="sm" />
        </Link>
        <NusaLink href="/design" variant="ghost" size="sm">
          {t("design.preview.toGallery")}
        </NusaLink>
      </header>

      <main className="relative mx-auto max-w-[1320px] px-4 pb-24 sm:px-8">
        <div className="max-w-[62ch] pt-10 pb-4 sm:pt-14">
          <p className="hud-label text-stage-muted">{t("design.preview.eyebrow")}</p>
          <h1 className="font-display-tight mt-3 text-[clamp(2.5rem,6vw,4.5rem)] leading-[0.95] text-kapas">
            {t("design.preview.title")}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-pretty text-stage-muted">{t("design.preview.subtitle")}</p>
          <p className="mt-2 text-sm text-stage-faint">{t("design.preview.replayHint")}</p>
        </div>

        {groups.map(({ surface, label, icon }) => {
          const { width, height } = SURFACE_VIEWPORT[surface];
          const scale = THUMB_SCALE[surface];
          return (
            <section
              key={surface}
              className="mt-12 border-t border-stage-line pt-8"
              aria-labelledby={`group-${surface}`}
            >
              <h2 id={`group-${surface}`} className="flex items-center gap-2 text-xl font-extrabold text-kapas">
                {icon}
                {label}
                <span className="tabular ml-2 text-sm font-semibold text-stage-faint">
                  {width}×{height}
                </span>
              </h2>
              <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-10">
                {PREVIEW_SCREENS.filter((s) => s.surface === surface).map((screen) => {
                  const name = t(`design.preview.screens.${screen.id}`);
                  const href = `/preview/${screen.id}`;
                  return (
                    <li key={screen.id} className="group" style={{ width: width * scale }}>
                      <Link href={href} className="block rounded-[10px_0_28px_0]" aria-label={`${name} (${label})`}>
                        <div
                          className="nf-md nf-clip relative overflow-hidden bg-stage-raised transition-[filter] duration-200 group-hover:brightness-110"
                          style={{ width: width * scale, height: height * scale }}
                        >
                          <iframe
                            src={href}
                            title={name}
                            loading="lazy"
                            tabIndex={-1}
                            aria-hidden="true"
                            className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
                            style={{ width, height, transform: `scale(${scale})` }}
                          />
                        </div>
                      </Link>
                      <div className="mt-3 flex items-start gap-3">
                        <span className="font-numeral text-4xl leading-[0.8] text-kapas/35" aria-hidden="true">
                          {number.get(screen.id)}
                        </span>
                        <div className="min-w-0">
                          <h3 className="leading-tight font-extrabold text-kapas">{name}</h3>
                          <p className="mt-0.5 truncate font-mono text-xs text-stage-faint">{href}</p>
                        </div>
                      </div>
                      {screen.variants.length > 0 && (
                        <ul className="mt-1 flex flex-wrap gap-x-1.5" aria-label={t("design.preview.variants")}>
                          {screen.variants.map((v) => (
                            <li key={v}>
                              <Link
                                href={`${href}?${VARIANT_QUERY[v]}`}
                                className="inline-flex min-h-11 items-center rounded-full"
                              >
                                <NusaBadge size="sm">{t(`design.preview.variantLabels.${v}`)}</NusaBadge>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        {/* Fallback pages render at their own URLs (a frame would only show the dev overlay). */}
        <section className="mt-12 flex flex-wrap items-center gap-3 border-t border-stage-line pt-8">
          <NusaLink href="/preview/error-boundary" variant="ghost" size="sm">
            error.tsx · {t("design.states.error")}
          </NusaLink>
          <NusaLink href="/preview/not-a-screen" variant="ghost" size="sm">
            not-found.tsx · 404
          </NusaLink>
        </section>
      </main>
    </div>
  );
}
