import type { Metadata } from "next";
import { Plus, Sparkles } from "lucide-react";
import { NusaBadge } from "@/components/ui/NusaBadge";
import { NusaLink } from "@/components/ui/NusaButton";
import { DashboardBoard } from "@/components/creator/dashboard/DashboardBoard";
import { formatLongDate, requestNow } from "@/components/creator/format";
import { getCreatorProfile } from "@/components/creator/profile";
import { firstName } from "@/components/creator/profile-schema";
import { nextClass } from "@/components/creator/schedule";
import { getLocale, getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("creator.dashboard.metaTitle") };
}

export default async function DashboardPage() {
  const [profile, locale, t] = await Promise.all([getCreatorProfile(), getLocale(), getT()]);
  // One clock for the whole render: demo history dates and "next class" agree on server and client.
  const now = requestNow();

  return (
    <>
      <header className="px-5 pt-8 pb-8 sm:px-10 sm:pt-11">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-6">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-3 text-sm font-semibold text-desk-muted">
              <span>{formatLongDate(now, locale)}</span>
              {profile.source === "demo" && (
                <NusaBadge tone="desk" size="sm">
                  {t("creator.demoMode")}
                </NusaBadge>
              )}
            </p>
            <h1 className="font-display-tight mt-4 text-[clamp(2.5rem,5.4vw,4.75rem)] leading-[0.92] text-desk-text">
              <span className="block text-desk-muted">{t("creator.welcome")}</span>
              <span className="block">
                {profile.salutation} {firstName(profile.fullName)}.
              </span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:pt-7">
            <NusaLink href="/quizzes/new?mode=ai" variant="desk-quiet" icon={<Sparkles size={18} aria-hidden="true" />}>
              {t("creator.generateAi")}
            </NusaLink>
            <NusaLink href="/quizzes/new" variant="desk" icon={<Plus size={18} aria-hidden="true" />}>
              {t("creator.quickCreate")}
            </NusaLink>
          </div>
        </div>
      </header>

      {/* The timetable is the demo lecturer's; accounts have no timetable source yet. */}
      <DashboardBoard now={now} upcoming={profile.source === "demo" ? nextClass(now) : null} />
    </>
  );
}
