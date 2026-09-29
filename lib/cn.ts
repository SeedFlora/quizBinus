import { clsx, type ClassValue } from "clsx";

/** Class name joiner. We don't use tailwind-merge: components avoid conflicting utilities by design. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
