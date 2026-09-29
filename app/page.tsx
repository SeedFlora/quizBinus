import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { BinusLogo } from "@/components/brand/BinusLogo";
import { StageBackground } from "@/components/brand/StageBackground";
import { HeroJoinForm } from "@/components/marketing/HeroJoinForm";
import { LiveStagePreview } from "@/components/marketing/LiveStagePreview";
import { HowItFlows } from "@/components/marketing/HowItFlows";
import { brand } from "@/lib/brand";
import { getT } from "@/lib/i18n/server";

export default async function LandingPage() {
  const t = await getT();
  return (
    <div className="stage isolate min-h-dvh">
      <StageBackground pattern="flow" intensity="quiet" fade="center" />

      <a href="#main" className="sr-only-focusable fixed top-3 left-3 z-50 bg-sun px-4 py-2 font-bold text-binus-950">
        {t("common.skipToContent")}
      </a>

      <header className="relative mx-auto flex max-w-[1320px] items-center justify-between px-4 pt-5 sm:px-8 sm:pt-8">
        <Link href="/" className="rounded-sm">
          <Wordmark size="md" />
        </Link>
        <div className="flex items-center gap-5">
          <Link
            href="/dashboard"
            className="hidden text-sm font-bold text-stage-muted transition-colors hover:text-kapas sm:inline"
          >
            {t("creator.nav.dashboard")}
          </Link>
          <BinusLogo height={30} />
        </div>
      </header>

      <main id="main">
        <section className="relative mx-auto grid max-w-[1320px] items-center gap-y-16 px-4 pt-10 pb-24 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-x-16 lg:pt-16 lg:pb-32">
          <div className="relative">
            <h1 className="text-kapas">
              <span className="font-display-wide block text-[clamp(2.75rem,7.4vw,6rem)] leading-[0.9] uppercase">
                {t("landing.heroLine1")}
              </span>
              <span className="font-numeral block text-[clamp(4.5rem,13vw,10.5rem)] leading-[0.82] uppercase">
                {t("landing.heroLine2")}
              </span>
            </h1>
            <p className="mt-6 max-w-[34ch] text-lg leading-relaxed text-pretty text-stage-muted sm:text-xl">
              {t("landing.heroSub")}
            </p>
            <div className="mt-10">
              <HeroJoinForm />
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[680px] pr-6 pb-16 sm:pr-10 lg:pb-10">
            <LiveStagePreview />
          </div>
        </section>

        <HowItFlows />
      </main>

      <footer className="relative mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-6 border-t border-stage-line px-4 py-10 sm:px-8">
        <div className="flex items-center gap-5">
          <Wordmark size="sm" />
          <span className="text-sm font-semibold text-stage-faint">{brand.tagline}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-stage-faint">{t("landing.footerNote")}</span>
          <BinusLogo height={26} />
        </div>
      </footer>
    </div>
  );
}
