"use client";

import { Search } from "lucide-react";
import { Field, Segmented, Select, TextInput } from "@/components/ui/desk/Field";
import { DIFFICULTIES, type Difficulty } from "@/lib/game/types";
import { useT } from "@/lib/i18n/client";
import type { LibraryFilter } from "../data";

/** Search + course + difficulty. Filters apply as you type; the count is announced politely. */
export function LibraryToolbar({
  filter,
  courses,
  resultCount,
  onChange,
}: {
  filter: LibraryFilter;
  courses: Array<{ code: string; name: string }>;
  resultCount: number;
  onChange: (next: LibraryFilter) => void;
}) {
  const t = useT();
  const difficultyOptions: Array<{ value: Difficulty | "all"; label: string }> = [
    { value: "all", label: t("creator.library.allDifficulties") },
    ...DIFFICULTIES.map((d) => ({ value: d, label: t(`creator.difficulty.${d}`) })),
  ];

  return (
    <div role="search" className="flex flex-wrap items-end gap-x-5 gap-y-4">
      <Field label={t("creator.library.searchLabel")} className="w-full sm:w-[320px]">
        {({ id }) => (
          <div className="relative">
            <Search
              size={18}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-desk-faint"
            />
            <TextInput
              id={id}
              type="search"
              value={filter.query}
              placeholder={t("creator.library.searchPlaceholder")}
              onChange={(e) => onChange({ ...filter, query: e.target.value })}
              className="pl-10"
            />
          </div>
        )}
      </Field>

      <Field label={t("creator.library.courseLabel")} className="w-full sm:w-[280px]">
        {({ id }) => (
          <Select id={id} value={filter.course} onChange={(e) => onChange({ ...filter, course: e.target.value })}>
            <option value="">{t("creator.library.allCourses")}</option>
            {courses.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div className="grid gap-1.5">
        <span className="text-sm font-bold text-desk-text" aria-hidden="true">
          {t("creator.library.difficultyLabel")}
        </span>
        <Segmented
          name="library-difficulty"
          label={t("creator.library.difficultyLabel")}
          value={filter.difficulty}
          options={difficultyOptions}
          onChange={(difficulty) => onChange({ ...filter, difficulty })}
        />
      </div>

      <p aria-live="polite" className="ml-auto pb-3 text-sm font-semibold text-desk-muted">
        {t("creator.library.results", { count: resultCount })}
      </p>
    </div>
  );
}
