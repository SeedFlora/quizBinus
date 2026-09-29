import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type NusaFrameSize = "sm" | "md" | "lg" | "xl";
export type NusaFrameTone = "solid" | "panel" | "outline" | "ghost" | "kapas" | "energy" | "sun" | "desk";

type NusaFrameProps<T extends ElementType> = {
  as?: T;
  size?: NusaFrameSize;
  tone?: NusaFrameTone;
  /** Mirror the geometry (cut top-left). Used for alternating rhythm. */
  flip?: boolean;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

/**
 * The proprietary NUSA FRAME container: modest top-left radius, diagonal top-right
 * cut, large bottom-right radius, small bottom-left notch. See app/styles/nusa-frame.css.
 */
export function NusaFrame<T extends ElementType = "div">({
  as,
  size = "md",
  tone = "solid",
  flip,
  className,
  children,
  ...rest
}: NusaFrameProps<T>) {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag className={cn("nf", `nf-${size}`, `nf-${tone}`, flip && "nf-flip", className)} {...rest}>
      {children}
    </Tag>
  );
}
