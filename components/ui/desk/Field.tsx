"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

/**
 * Creator ("desk") form primitives. Calm, light, precise: the lecturer's tools,
 * not the game. Every control has a visible label, hint/error wiring via
 * aria-describedby, a 44px minimum target, and a blue focus ring.
 */

const control =
  "w-full rounded-[8px_2px_12px_2px] border border-desk-line bg-desk-surface px-3.5 text-[15px] text-desk-text placeholder:text-desk-faint " +
  "transition-[border-color,box-shadow] duration-150 hover:border-desk-faint focus:border-binus-500 focus:outline-none " +
  "focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--binus-blue-500)_22%,transparent)] disabled:cursor-not-allowed disabled:bg-desk-sunken disabled:text-desk-faint " +
  "aria-[invalid=true]:border-danger";

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
  optional,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  className?: string;
  htmlFor?: string;
  optional?: string;
}) {
  const auto = useId();
  const id = htmlFor ?? auto;
  const hintId = `${id}-hint`;
  const describedBy = error || hint ? hintId : undefined;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-bold text-desk-text">
        {label}
        {optional && <span className="ml-1.5 font-medium text-desk-faint">{optional}</span>}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {(error || hint) && (
        <p
          id={hintId}
          className={cn("text-[13px]", error ? "font-semibold text-danger" : "text-desk-muted")}
          role={error ? "alert" : undefined}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(control, "h-11", className)} {...props} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { className, rows = 3, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(control, "min-h-11 resize-y py-2.5 leading-relaxed", className)}
      {...props}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(control, "h-11 appearance-none pr-9", className)} {...props}>
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-desk-muted"
      >
        <path
          d="M4 6l4 4 4-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
});

/** Radio group drawn as joined segments (timer presets, points, difficulty…). */
export function Segmented<T extends string | number>({
  name,
  value,
  options,
  onChange,
  label,
  className,
  size = "md",
}: {
  name: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: ReactNode; disabled?: boolean; hint?: string }>;
  onChange: (value: T) => void;
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex flex-wrap gap-1 rounded-[10px_3px_14px_3px] bg-desk-sunken p-1", className)}
    >
      {options.map((opt) => {
        const checked = opt.value === value;
        return (
          <label
            key={String(opt.value)}
            title={opt.hint}
            className={cn(
              "relative inline-flex cursor-pointer items-center justify-center rounded-[7px_2px_10px_2px] px-3 font-bold transition-colors select-none",
              size === "sm" ? "min-h-9 text-[13px]" : "min-h-10 text-sm",
              checked
                ? "bg-desk-surface text-binus-500 shadow-[0_1px_0_var(--desk-line)]"
                : "text-desk-muted hover:text-desk-text",
              opt.disabled && "cursor-not-allowed opacity-40",
              "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-binus-500",
            )}
          >
            <input
              type="radio"
              name={name}
              value={String(opt.value)}
              checked={checked}
              disabled={opt.disabled}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}

/** Accessible switch (button role="switch"). */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p id={`${id}-l`} className="text-sm font-bold text-desk-text">
          {label}
        </p>
        {description && (
          <p id={`${id}-d`} className="mt-0.5 text-[13px] text-desk-muted">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={description ? `${id}-d` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40",
          checked ? "bg-binus-500" : "bg-desk-line",
        )}
      >
        <span
          className={cn(
            "absolute top-1 left-1 size-5 rounded-[6px_2px_8px_2px] bg-white shadow-sm transition-transform duration-150",
            checked && "translate-x-5",
          )}
        />
      </button>
    </div>
  );
}
