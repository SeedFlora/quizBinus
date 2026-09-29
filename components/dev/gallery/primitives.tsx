"use client";

import { useEffect, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { NusaButton } from "@/components/ui/NusaButton";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";

/** Same five-way drop-shadow the product uses for :focus-visible, so a forced focus looks identical. */
export const FOCUS_RING =
  "drop-shadow(0 0 0 var(--focus)) drop-shadow(3px 0 0 var(--focus)) drop-shadow(-3px 0 0 var(--focus)) drop-shadow(0 3px 0 var(--focus)) drop-shadow(0 -3px 0 var(--focus))";

/**
 * A numbered gallery section. The two-digit numeral is the product's signature
 * voice, used here as the section's architecture rather than as decoration.
 */
export function Section({
  id,
  index,
  title,
  note,
  children,
}: {
  id: string;
  index: number;
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 border-t border-stage-line pt-10 pb-16">
      <header className="flex items-end gap-5">
        <span
          className="font-numeral shrink-0 text-[clamp(4rem,7vw,5.5rem)] leading-[0.78] text-kapas/15"
          aria-hidden="true"
        >
          {String(index).padStart(2, "0")}
        </span>
        <div className="min-w-0 pb-1">
          <h2
            id={`${id}-title`}
            className="font-display-tight text-[clamp(1.75rem,3vw,2.25rem)] leading-none text-kapas"
          >
            {title}
          </h2>
          <p className="mt-2 max-w-[68ch] text-[15px] leading-relaxed text-pretty text-stage-muted">{note}</p>
        </div>
      </header>
      <div className="mt-9">{children}</div>
    </section>
  );
}

/** One specimen with its state label underneath. */
export function Specimen({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <figure className={cn("flex min-w-0 flex-col", className)}>
      <div className="flex min-h-0 flex-1 items-center">{children}</div>
      <figcaption className="hud-label mt-3 text-[10px] text-stage-faint [.theme-desk_&]:text-desk-muted">
        {label}
      </figcaption>
    </figure>
  );
}

/** Small sub-heading inside a section. */
export function Subhead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn("mb-4 text-sm font-extrabold text-kapas [.theme-desk_&]:text-desk-text", className)}>
      {children}
    </h3>
  );
}

/** Remount key + button: replays entrance and celebration animations on demand. */
export function useReplay() {
  const [run, setRun] = useState(0);
  return { run, replay: () => setRun((n) => n + 1) };
}

export function ReplayButton({ onClick, className }: { onClick: () => void; className?: string }) {
  const t = useT();
  return (
    <NusaButton
      variant="ghost"
      size="sm"
      onClick={onClick}
      icon={<RotateCcw size={16} aria-hidden="true" />}
      className={className}
    >
      {t("design.replay")}
    </NusaButton>
  );
}

/** True after hydration. Specimens that read the wall clock render only then. */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot client flag
    setMounted(true);
  }, []);
  return mounted;
}
