import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { BinusLogo } from "@/components/brand/BinusLogo";
import { StageBackground } from "@/components/brand/StageBackground";
import { NusaLink } from "@/components/ui/NusaButton";
import { isDatabaseConfigured } from "@/lib/env.server";
import { getLecturerOrNull } from "@/lib/auth/lecturer";
import { safeNextPath } from "@/lib/auth/redirect";
import { getT } from "@/lib/i18n/server";
import { LoginForm } from "./LoginForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.metaTitle"), robots: { index: false } };
}

/** What an admin sets to turn on accounts (docs/DATABASE.md). */
const ENV_VARS = ["DATABASE_URL", "ADMIN_EMAIL", "ADMIN_PASSWORD"];

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const t = await getT();
  const params = await searchParams;
  const next = safeNextPath(Array.isArray(params.next) ? params.next[0] : params.next);
  const database = isDatabaseConfigured();

  // Already signed in: the login page is only a doorway.
  if (database && (await getLecturerOrNull())) redirect(next);

  return (
    <div className="stage isolate flex min-h-dvh flex-col">
      <StageBackground pattern="grid" intensity="quiet" fade="edges" />

      <a href="#login" className="sr-only-focusable fixed top-3 left-3 z-50 bg-sun px-4 py-2 font-bold text-binus-950">
        {t("common.skipToContent")}
      </a>

      <header className="relative mx-auto flex w-full max-w-[1200px] items-center justify-between px-4 pt-5 sm:px-8 sm:pt-8">
        <Link href="/" className="rounded-sm">
          <Wordmark size="md" />
        </Link>
        <BinusLogo height={30} />
      </header>

      <main className="relative mx-auto grid w-full max-w-[1200px] flex-1 items-center gap-x-16 gap-y-10 px-4 pt-10 pb-12 sm:px-8 lg:grid-cols-[minmax(0,1fr)_440px] lg:pt-6 lg:pb-20">
        <section className="max-w-[560px]">
          <p className="text-sm font-extrabold text-energy">{t("auth.eyebrow")}</p>
          <h1 className="font-display-wide mt-3 text-[clamp(2.4rem,5.6vw,4.75rem)] leading-[0.95] text-balance text-kapas">
            {t("auth.title")}
          </h1>
          <p className="mt-5 max-w-[42ch] text-lg leading-relaxed text-pretty text-stage-muted">{t("auth.subtitle")}</p>

          {/* Students who land here by mistake (often on a phone) see their way out
              before the lecturer form. */}
          <p className="mt-8 flex max-w-[42ch] flex-wrap items-center gap-x-3 border-t border-stage-line pt-4 text-[15px] text-stage-muted lg:mt-12">
            <span>{t("auth.studentPrompt")}</span>
            <Link
              href="/join"
              className="inline-flex min-h-11 items-center gap-2 font-bold text-kapas underline-offset-4 transition-colors hover:text-sun hover:underline"
            >
              {t("auth.studentCta")}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </p>
        </section>

        <div id="login" className="w-full max-w-[480px] justify-self-center lg:max-w-none">
          <div className="nf nf-lg nf-desk text-desk-text">
            {/* theme-desk: light colour-scheme + blue focus rings; its canvas colour is
                cancelled so the frame's own white fill shows. */}
            <div className="theme-desk bg-transparent px-6 pt-8 pb-9 sm:px-9">
              {database ? (
                <LoginForm next={next} />
              ) : (
                <div>
                  <h2 className="font-display-tight text-[1.75rem] leading-tight text-desk-text">
                    {t("auth.demoTitle")}
                  </h2>
                  <p className="mt-2 leading-relaxed text-pretty text-desk-muted">{t("auth.demoBody")}</p>
                  <NusaLink
                    href="/dashboard"
                    size="lg"
                    block
                    className="mt-7"
                    trailing={<ArrowRight size={20} aria-hidden="true" />}
                  >
                    {t("auth.demoCta")}
                  </NusaLink>
                  <div className="mt-8 border-t border-desk-line pt-5">
                    <p className="text-sm font-bold text-desk-text">{t("auth.demoAdminTitle")}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-desk-muted">
                      {t("auth.demoAdminBody", { file: "docs/DATABASE.md" })}
                    </p>
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {ENV_VARS.map((name) => (
                        <li key={name}>
                          <code className="rounded-[4px_1px_6px_1px] bg-desk-sunken px-2 py-1 font-mono text-[12px] text-desk-text">
                            {name}
                          </code>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
