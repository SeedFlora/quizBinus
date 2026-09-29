"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BarChart3, CalendarClock, Home, Layers, LogOut, Settings } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { BinusLogo } from "@/components/brand/BinusLogo";
import { NusaPattern } from "@/components/brand/NusaPattern";
import { NusaAvatar } from "@/components/game/NusaAvatar";
import { useT } from "@/lib/i18n/client";
import type { TranslationKey } from "@/lib/i18n/config";
import { cn } from "@/lib/cn";
import { CreatorStorageProvider, type CreatorStorage } from "./storage-context";

type NavItem = { href: string; key: TranslationKey; icon: typeof Home; match: (p: string) => boolean };

const nav = (storage: CreatorStorage): NavItem[] => [
  { href: "/dashboard", key: "creator.nav.dashboard", icon: Home, match: (p) => p === "/dashboard" },
  {
    href: "/quizzes",
    key: "creator.nav.quizzes",
    icon: Layers,
    match: (p) => p.startsWith("/quizzes") && !p.endsWith("/analytics"),
  },
  { href: "/sessions", key: "creator.nav.sessions", icon: CalendarClock, match: (p) => p.startsWith("/sessions") },
  {
    // Database mode: /analytics opens the lecturer's latest class. Memory mode: the sample arena's report.
    href: storage === "database" ? "/analytics" : "/quizzes/os-battle/analytics",
    key: "creator.nav.analytics",
    icon: BarChart3,
    match: (p) => p.endsWith("/analytics"),
  },
  { href: "/settings", key: "creator.nav.settings", icon: Settings, match: (p) => p.startsWith("/settings") },
];

export interface LecturerSummary {
  name: string;
  salutation: string;
  email?: string;
}

/**
 * The lecturer's desk: a navy rail (the stage colour, so the product is still
 * recognisable) beside a calm light canvas. Collapses to a top bar below 1024px.
 * Provides the storage mode to every creator screen; signing out only exists in
 * database mode (memory mode has no accounts).
 */
export function CreatorShell({
  children,
  lecturer,
  storage,
}: {
  children: ReactNode;
  lecturer: LecturerSummary;
  storage: CreatorStorage;
}) {
  const t = useT();
  const pathname = usePathname();
  const signedIn = storage === "database";
  return (
    <CreatorStorageProvider storage={storage}>
      <div className="theme-desk min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
        <a
          href="#desk-main"
          className="sr-only-focusable fixed top-3 left-3 z-50 bg-sun px-4 py-2 font-bold text-binus-950"
        >
          {t("common.skipToContent")}
        </a>
        <aside className="relative isolate flex flex-col overflow-hidden bg-desk-rail text-kapas lg:sticky lg:top-0 lg:h-dvh">
          <NusaPattern kind="kawung" intensity="quiet" fade="bottom" />
          <div className="relative flex items-center justify-between px-5 py-4 lg:py-6">
            <Link href="/dashboard" aria-label={t("creator.nav.dashboard")}>
              <Wordmark size="sm" />
            </Link>
            {signedIn && <SignOutButton label={t("creator.signOut")} className="lg:hidden" iconOnly />}
          </div>
          <nav
            aria-label={t("creator.nav.label")}
            className="relative flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-0"
          >
            {nav(storage).map(({ href, key, icon: Icon, match }) => {
              const active = match(pathname);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 shrink-0 items-center gap-3 rounded-[10px_3px_14px_3px] px-3 text-sm font-bold whitespace-nowrap transition-colors",
                    active ? "bg-kapas text-binus-950" : "text-kapas/70 hover:bg-kapas/10 hover:text-kapas",
                  )}
                >
                  <Icon size={18} aria-hidden="true" />
                  {t(key)}
                </Link>
              );
            })}
          </nav>
          <div className="relative mt-auto hidden border-t border-kapas/10 p-4 lg:block">
            <div className="flex items-center gap-3">
              <NusaAvatar seed={lecturer.name} size={40} />
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold">
                  {lecturer.salutation} {lecturer.name}
                </p>
                {lecturer.email && <p className="truncate text-xs text-kapas/55">{lecturer.email}</p>}
              </div>
            </div>
            {signedIn && <SignOutButton label={t("creator.signOut")} className="mt-3" />}
            <div className="mt-4">
              <BinusLogo height={26} />
            </div>
          </div>
        </aside>
        <main id="desk-main" className="min-w-0">
          {children}
        </main>
      </div>
    </CreatorStorageProvider>
  );
}

/** A plain form POST, so signing out works before hydration and needs no client state. */
function SignOutButton({ label, className, iconOnly }: { label: string; className?: string; iconOnly?: boolean }) {
  return (
    <form action="/auth/signout" method="post" className={className}>
      <button
        type="submit"
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
        className={cn(
          "flex min-h-11 items-center gap-2 rounded-[10px_3px_14px_3px] text-sm font-bold text-kapas/70 transition-colors hover:bg-kapas/10 hover:text-kapas",
          iconOnly ? "min-w-11 justify-center" : "-ml-1 px-2",
        )}
      >
        <LogOut size={18} aria-hidden="true" />
        {!iconOnly && label}
      </button>
    </form>
  );
}

/** Page header used by every creator page: title, optional subtitle, actions on the right. */
export function DeskHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-desk-line px-5 pt-8 pb-6 sm:px-10">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-sm font-semibold text-desk-muted">{eyebrow}</div>}
        <h1 className="font-display-tight text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.05] text-desk-text">{title}</h1>
        {subtitle && <p className="mt-2 max-w-[62ch] text-desk-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}
