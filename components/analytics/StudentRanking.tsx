"use client";

import { useDeferredValue, useId, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { NusaAvatar } from "@/components/game/NusaAvatar";
import { RatioBar } from "@/components/creator/RatioBar";
import { NusaButton } from "@/components/ui/NusaButton";
import type { StudentAnalytics } from "@/lib/analytics/compute";
import { formatInteger, formatSeconds, pad2, toPercent } from "@/lib/analytics/format";
import { normalizeText } from "@/lib/game/evaluate";
import { useI18n } from "@/lib/i18n/client";
import type { TranslationKey } from "@/lib/i18n/config";
import { cn } from "@/lib/cn";

type SortKey = "rank" | "student" | "score" | "correct" | "accuracy" | "avgTime" | "bestStreak";
type Direction = "asc" | "desc";

const TOP = 10;

/** First click on a column sorts the way a lecturer usually asks the question. */
const NATURAL: Record<SortKey, Direction> = {
  rank: "asc",
  student: "asc",
  score: "desc",
  correct: "desc",
  accuracy: "desc",
  avgTime: "asc",
  bestStreak: "desc",
};

const COLUMNS: Array<{ key: SortKey; label: TranslationKey; numeric: boolean }> = [
  { key: "rank", label: "analytics.col.rank", numeric: false },
  { key: "student", label: "analytics.col.student", numeric: false },
  { key: "score", label: "analytics.col.score", numeric: true },
  { key: "correct", label: "analytics.col.correct", numeric: true },
  { key: "accuracy", label: "analytics.col.accuracy", numeric: false },
  { key: "avgTime", label: "analytics.col.avgTime", numeric: true },
  { key: "bestStreak", label: "analytics.col.bestStreak", numeric: true },
];

function sortValue(s: StudentAnalytics, key: SortKey): number | string | null {
  switch (key) {
    case "rank":
      return s.rank;
    case "student":
      return s.nickname;
    case "score":
      return s.score;
    case "correct":
      return s.correct;
    case "accuracy":
      return s.accuracy;
    case "avgTime":
      return s.averageResponseMs;
    case "bestStreak":
      return s.bestStreak;
  }
}

/**
 * Accessible, sortable standings. Sorting is a real <button> in each header with
 * aria-sort on the cell; the table shows the top ten until the lecturer asks for
 * everyone, and a search narrows by nickname.
 */
export function StudentRanking({ students }: { students: StudentAnalytics[] }) {
  const { t, locale } = useI18n();
  const [sort, setSort] = useState<{ key: SortKey; direction: Direction }>({ key: "rank", direction: "asc" });
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const searchId = useId();

  const rows = useMemo(() => {
    const needle = normalizeText(deferredQuery);
    const filtered = needle ? students.filter((s) => normalizeText(s.nickname).includes(needle)) : students;
    const sign = sort.direction === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      // A student who never answered has no accuracy or time: always last, either direction.
      if (x === null || y === null) return x === y ? a.rank - b.rank : x === null ? 1 : -1;
      const diff =
        typeof x === "string" ? x.localeCompare(String(y), locale, { sensitivity: "base" }) : x - (y as number);
      return diff * sign || a.rank - b.rank;
    });
  }, [students, deferredQuery, sort, locale]);

  const limited = !showAll && !deferredQuery && rows.length > TOP;
  const visible = limited ? rows.slice(0, TOP) : rows;

  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: NATURAL[key] },
    );

  return (
    <section aria-labelledby="ranking-title" className="nf nf-lg nf-desk p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="ranking-title" className="font-display-tight text-2xl text-desk-text">
            {t("analytics.ranking")}
          </h2>
          <p className="mt-1.5 text-sm text-desk-muted">{t("analytics.rankingSub")}</p>
        </div>
        <div className="w-full sm:w-72">
          <label htmlFor={searchId} className="text-sm font-bold text-desk-text">
            {t("analytics.searchStudent")}
          </label>
          <div className="relative mt-1.5">
            <Search
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-desk-faint"
            />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("analytics.searchPlaceholder")}
              autoComplete="off"
              className="h-11 w-full rounded-[8px_2px_12px_2px] border border-desk-line bg-desk-surface pr-3 pl-9 text-[15px] text-desk-text placeholder:text-desk-faint hover:border-desk-faint focus:border-binus-500 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--binus-blue-500)_22%,transparent)] focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse text-left">
          <caption className="sr-only">{t("analytics.rankingCaption", { count: students.length })}</caption>
          <thead>
            <tr className="border-b border-desk-line">
              {COLUMNS.map((col) => {
                const active = sort.key === col.key;
                const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
                    className={cn("py-2 pr-3 align-bottom last:pr-0 xl:pr-4", col.numeric && "text-right")}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-1.5 text-left text-[13px] leading-tight font-bold transition-colors xl:whitespace-nowrap",
                        col.numeric && "text-right",
                        active ? "text-desk-text" : "text-desk-muted hover:text-desk-text",
                      )}
                    >
                      {t(col.label)}
                      <Icon size={14} aria-hidden="true" className={active ? "text-binus-500" : "text-desk-faint"} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => (
              <tr key={s.playerId} className="border-b border-desk-line last:border-b-0 hover:bg-desk/60">
                <td className="py-2.5 pr-3 xl:pr-4">
                  <span className="font-numeral text-[1.75rem] leading-none text-desk-text">
                    <span className="text-[0.6em] text-desk-faint">#</span>
                    {pad2(s.rank)}
                  </span>
                </td>
                <th scope="row" className="py-2.5 pr-3 font-normal xl:pr-4">
                  <span className="flex min-w-0 items-center gap-3">
                    <NusaAvatar seed={s.avatarSeed} size={34} />
                    <span className="truncate font-bold text-desk-text">{s.nickname}</span>
                  </span>
                </th>
                <td className="tabular py-2.5 pr-3 text-right font-bold text-desk-text xl:pr-4">
                  {formatInteger(s.score, locale)}
                </td>
                <td className="tabular py-2.5 pr-3 text-right text-desk-text xl:pr-4">
                  {s.correct}
                  <span className="text-desk-muted">/{s.questions}</span>
                </td>
                <td className="py-2.5 pr-3 xl:pr-4">
                  <span className="flex items-center gap-3">
                    <span className="tabular w-10 text-right font-bold text-desk-text">
                      {s.accuracy === null ? "–" : `${toPercent(s.accuracy)}%`}
                    </span>
                    {s.accuracy !== null && <RatioBar value={s.accuracy} className="hidden w-20 xl:block" />}
                  </span>
                </td>
                <td className="tabular py-2.5 pr-3 text-right text-desk-text xl:pr-4">
                  {formatSeconds(s.averageResponseMs, locale)}
                  {s.averageResponseMs !== null && <span className="text-desk-muted"> {t("common.secondsShort")}</span>}
                </td>
                <td className="tabular py-2.5 text-right text-desk-text">
                  <span className="text-desk-muted">×</span>
                  {s.bestStreak}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <p className="py-6 text-center text-desk-muted">{t("analytics.noStudents")}</p>}
      </div>

      {!deferredQuery && rows.length > TOP && (
        <div className="mt-5">
          <NusaButton variant="desk-quiet" size="sm" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
            {showAll ? t("analytics.showTop") : t("analytics.showAll", { count: rows.length })}
          </NusaButton>
        </div>
      )}
    </section>
  );
}
