import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { NusaSpinner } from "./NusaSpinner";

export type NusaButtonVariant = "energy" | "sun" | "blue" | "kapas" | "ghost" | "danger" | "desk" | "desk-quiet";
export type NusaButtonSize = "sm" | "md" | "lg" | "xl";

interface CommonProps {
  variant?: NusaButtonVariant;
  size?: NusaButtonSize;
  /** Leading icon (Lucide utility icon or AnswerSymbol). */
  icon?: ReactNode;
  /** Trailing icon. */
  trailing?: ReactNode;
  block?: boolean;
  className?: string;
  children: ReactNode;
}

function classes(size: NusaButtonSize, block: boolean | undefined, className?: string) {
  const frame = size === "sm" ? "nf-sm" : size === "xl" ? "nf-lg" : "nf-md";
  return cn("nf nq-btn", frame, block && "w-full", className);
}

function Label({ icon, trailing, children }: Pick<CommonProps, "icon" | "trailing" | "children">) {
  return (
    <span className="nq-btn__label">
      {icon}
      <span>{children}</span>
      {trailing}
    </span>
  );
}

/**
 * Primary action. Press depth comes from a shelf layer: on press the face sinks
 * onto it, acknowledging the tap within one frame.
 */
export function NusaButton({
  variant = "energy",
  size = "md",
  icon,
  trailing,
  block,
  loading,
  loadingLabel,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
    loading?: boolean;
    /** Announced while loading; defaults to the button text. */
    loadingLabel?: string;
  }) {
  return (
    <button
      type={type}
      data-variant={variant}
      data-size={size}
      aria-busy={loading || undefined}
      disabled={disabled}
      className={classes(size, block, className)}
      {...rest}
    >
      {loading ? (
        <Label icon={<NusaSpinner />}>{loadingLabel ?? children}</Label>
      ) : (
        <Label icon={icon} trailing={trailing}>
          {children}
        </Label>
      )}
    </button>
  );
}

export function NusaLink({
  variant = "energy",
  size = "md",
  icon,
  trailing,
  block,
  className,
  children,
  ...rest
}: CommonProps & Omit<ComponentProps<typeof Link>, "children" | "className">) {
  return (
    <Link data-variant={variant} data-size={size} className={classes(size, block, className)} {...rest}>
      <Label icon={icon} trailing={trailing}>
        {children}
      </Label>
    </Link>
  );
}
