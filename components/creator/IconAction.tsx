"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const base =
  "inline-grid size-11 shrink-0 place-items-center rounded-[8px_2px_12px_2px] text-desk-muted transition-colors hover:bg-desk-sunken hover:text-desk-text disabled:cursor-not-allowed disabled:opacity-40";

/**
 * A 44px icon-only row action. The accessible name carries the object
 * ("Hapus: OS Battle"), the native tooltip carries the short verb.
 */
export function IconAction({
  label,
  tooltip,
  icon,
  onClick,
  href,
  tone = "neutral",
  disabled,
}: {
  label: string;
  tooltip: string;
  icon: ReactNode;
  onClick?: () => void;
  href?: string;
  tone?: "neutral" | "danger";
  disabled?: boolean;
}) {
  const className = cn(base, tone === "danger" && "hover:bg-danger/10 hover:text-danger");
  if (href) {
    return (
      <Link href={href} aria-label={label} title={tooltip} className={className}>
        {icon}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      title={tooltip}
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {icon}
    </button>
  );
}
