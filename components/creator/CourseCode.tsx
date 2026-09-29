import { cn } from "@/lib/cn";

/**
 * A course code set like a scoreboard: the faculty prefix small, the number as a
 * condensed numeral. It anchors each row the way "#03" anchors a leaderboard row.
 */
export function CourseCode({ code, className, size = "md" }: { code: string; className?: string; size?: "md" | "lg" }) {
  const match = /^([A-Za-z]+)\s*(.+)$/.exec(code);
  const prefix = match?.[1] ?? "";
  const number = match?.[2] ?? code;
  return (
    <span className={cn("inline-flex flex-col leading-none", className)} aria-label={code}>
      {prefix && (
        <span aria-hidden="true" className="text-[11px] font-extrabold tracking-[0.12em] text-desk-muted">
          {prefix}
        </span>
      )}
      <span
        aria-hidden="true"
        className={cn("font-numeral text-desk-text", size === "lg" ? "text-[2.75rem]" : "text-[2rem]")}
      >
        {number || "—"}
      </span>
    </span>
  );
}
