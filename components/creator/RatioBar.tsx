import { cn } from "@/lib/cn";

/**
 * A thin parang-cut bar for a 0..1 ratio. Decorative: the number beside it is
 * always the accessible value.
 */
export function RatioBar({
  value,
  className,
  tone = "blue",
}: {
  value: number;
  className?: string;
  tone?: "blue" | "ink";
}) {
  const width = `${Math.max(0, Math.min(1, value)) * 100}%`;
  return (
    <span
      aria-hidden="true"
      className={cn("relative block h-2 overflow-hidden rounded-[2px] bg-desk-sunken", className)}
    >
      <span
        className={cn(
          "parang-slash absolute inset-y-0 left-0 text-[16px]",
          tone === "blue" ? "bg-binus-500" : "bg-desk-text",
        )}
        style={{ width }}
      />
    </span>
  );
}
