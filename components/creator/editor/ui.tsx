"use client";

import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

/** Shared look of an editable answer row (choices, steps, accepted answers). */
export const answerRowClass = cn(
  "nf nf-sm nf-desk flex min-h-14 items-center gap-2.5 py-1.5 pr-1.5 sm:gap-3",
  "focus-within:[--nf-stroke-w:2px] focus-within:[--nf-stroke:var(--binus-blue-500)]",
);
export const answerTextClass =
  "text-desk-text placeholder:text-desk-faint min-w-0 flex-1 bg-transparent py-2.5 text-[15px] leading-snug font-semibold outline-none";

/**
 * Single-line text that wraps instead of scrolling sideways, so long answer choices
 * stay fully readable while reviewing. Enter never inserts a newline: it calls
 * `onEnter` (e.g. jump to the next choice).
 */
export const AutoGrowText = forwardRef<
  HTMLTextAreaElement,
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & {
    value: string;
    onValueChange: (value: string) => void;
    onEnter?: () => void;
  }
>(function AutoGrowText({ value, onValueChange, onEnter, onKeyDown, className, ...props }, ref) {
  const inner = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLTextAreaElement);

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={inner}
      rows={1}
      value={value}
      onChange={(e) => onValueChange(e.target.value.replace(/\s*\n\s*/g, " "))}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          onEnter?.();
        }
        onKeyDown?.(e);
      }}
      className={cn("block resize-none overflow-hidden", className)}
      {...props}
    />
  );
});

/** Square 44px icon button for the desk. The label doubles as tooltip and accessible name. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
    label: string;
    icon: ReactNode;
    tone?: "default" | "danger";
    size?: "md" | "sm";
  }
>(function IconButton({ label, icon, tone = "default", size = "md", className, type = "button", ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-[8px_2px_12px_2px] transition-colors disabled:cursor-not-allowed disabled:opacity-35",
        size === "md" ? "size-11" : "size-9",
        tone === "danger"
          ? "text-desk-faint hover:bg-danger/10 hover:text-danger enabled:active:bg-danger/15"
          : "text-desk-muted hover:bg-desk-sunken hover:text-desk-text enabled:active:bg-desk-line",
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
});

/** Small sentence-case heading for a group of fields inside a panel. */
export function SectionTitle({ children, aside, id }: { children: ReactNode; aside?: ReactNode; id?: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-[13px] font-bold text-desk-muted">
        {children}
      </h2>
      {aside}
    </div>
  );
}

/** Inline validation message tied to a group (answers, accepted answers…). */
export function InlineIssue({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-danger">
      <TriangleAlert size={14} aria-hidden="true" />
      {children}
    </p>
  );
}
