/**
 * WCAG 2.x contrast for design tokens, computed from the live CSS custom
 * properties (so the gallery can never drift from tokens.css).
 */

export type Rgba = { r: number; g: number; b: number; a: number };

export function parseColor(input: string): Rgba | null {
  const v = input.trim();
  // #rgb, #rgba, #rrggbb, #rrggbbaa (the CSS minifier rewrites rgb(… / a) to 8-digit hex)
  const hex = v.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    const h = hex[1]!.length <= 4 ? [...hex[1]!].map((c) => c + c).join("") : hex[1]!;
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a };
  }
  // rgb(1 2 3 / 0.5), rgb(1, 2, 3), rgba(1, 2, 3, 0.5)
  const fn = v.match(/^rgba?\(([^)]+)\)$/i);
  if (fn) {
    const parts = fn[1]!
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
    return { r: parts[0]!, g: parts[1]!, b: parts[2]!, a: parts[3] ?? 1 };
  }
  return null;
}

/** Alpha-composite `fg` over an opaque `bg`. */
export function over(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

function luminance({ r, g, b }: Rgba) {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(fg: Rgba, bg: Rgba): number {
  const solid = fg.a < 1 ? over(fg, bg) : fg;
  const [hi, lo] = [luminance(solid), luminance(bg)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** AA = normal text ≥ 4.5, AA large = ≥ 3 (large/bold text and UI parts), else low. */
export function grade(ratio: number): "aa" | "aaLarge" | "fail" {
  return ratio >= 4.5 ? "aa" : ratio >= 3 ? "aaLarge" : "fail";
}

export function toHex({ r, g, b, a }: Rgba): string {
  const h = (n: number) => Math.round(n).toString(16).padStart(2, "0").toUpperCase();
  return `#${h(r)}${h(g)}${h(b)}${a < 1 ? ` · ${Math.round(a * 100)}%` : ""}`;
}
