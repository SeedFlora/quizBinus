import { ImageResponse } from "next/og";
import { brand } from "@/lib/brand";

/**
 * Social preview: the navy stage, the wordmark, the tagline and the four answer
 * identities, with a ghost round numeral as architecture (DESIGN §0).
 * Colours mirror app/styles/tokens.css (ImageResponse cannot read CSS variables).
 */

export const alt = `${brand.name}: ${brand.descriptor}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const C = {
  stage: "#061433",
  raised: "#0B2150",
  sky: "#46B8F4",
  orange: "#F7861F",
  yellow: "#FFC82E",
  kapas: "#FFF9EE",
  muted: "rgba(255,249,238,0.64)",
} as const;

/** Google Fonts serves a static TTF instance for an axis tuple + text subset (satori needs ttf/otf/woff). */
async function googleFont(family: string, axes: string, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=${family}:${axes}&text=${encodeURIComponent(text)}`)
    ).text();
    const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!src) return null;
    const res = await fetch(src);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null; // offline build: fall back to the bundled default font
  }
}

const LOBE = "M24 22 C 18.6 19.4, 18.2 11.2, 24 6.4 C 29.8 11.2, 29.4 19.4, 24 22 Z";
const CHIP_LOBE = "M16 14.6 C 11.6 12.4, 11.2 5.6, 16 1.6 C 20.8 5.6, 20.4 12.4, 16 14.6 Z";
const CLOUD =
  "M7.6 26.4 C 3.2 26.4, 1.8 20.4, 6 18.6 C 5.4 12.8, 11.8 9.8, 15.4 13.4 C 17.4 7.4, 26.8 7.6, 26.6 15 C 31.4 15.6, 31.6 26.4, 25.4 26.4 Z";
const STAR = Array.from({ length: 16 }, (_, i) => {
  const r = i % 2 === 0 ? 13.5 : 7.6;
  const a = ((-90 + i * 22.5) * Math.PI) / 180;
  return `${(16 + r * Math.cos(a)).toFixed(2)} ${(16 + r * Math.sin(a)).toFixed(2)}`;
}).join(" L ");

/** Answer glyphs (see AnswerSymbol). Satori needs intrinsic SVG elements only: no fragments. */
function ChipSymbol({ kind, ink }: { kind: "kawung" | "parang" | "mega" | "bintang"; ink: string }) {
  return (
    <svg width="44" height="44" viewBox="0 0 32 32" fill={ink}>
      {kind === "kawung" &&
        [0, 90, 180, 270].map((d) => <path key={d} d={CHIP_LOBE} transform={`rotate(${d} 16 16)`} />)}
      {kind === "parang" && (
        <g>
          <path d="M3.5 27 L13.5 5 H19 L9 27 Z" />
          <path d="M13 27 L23 5 H28.5 L18.5 27 Z" />
        </g>
      )}
      {kind === "mega" && (
        <g>
          <mask id="m">
            <path d={CLOUD} fill="white" />
            <path d={CLOUD} fill="black" transform="translate(16 19.4) scale(0.64) translate(-16 -19.4)" />
            <path d={CLOUD} fill="white" transform="translate(16 20) scale(0.36) translate(-16 -20)" />
          </mask>
          <rect width="32" height="32" mask="url(#m)" />
        </g>
      )}
      {kind === "bintang" && <path fillRule="evenodd" d={`M ${STAR} Z M16 13 L19 16 L16 19 L13 16 Z`} />}
    </svg>
  );
}

const CHIPS = [
  { letter: "A", kind: "kawung", fill: C.sky, ink: "#04203A" },
  { letter: "B", kind: "parang", fill: C.orange, ink: "#2B1400" },
  { letter: "C", kind: "mega", fill: C.kapas, ink: C.stage },
  { letter: "D", kind: "bintang", fill: C.yellow, ink: "#2A1D00" },
] as const;

export default async function OpengraphImage() {
  const [nusa, condensed, jakarta] = await Promise.all([
    googleFont("Bricolage+Grotesque", "opsz,wdth,wght@96,100,800", "NUSA"),
    googleFont("Bricolage+Grotesque", "opsz,wdth,wght@96,75,800", "QUEST04ABCD"),
    googleFont("Plus+Jakarta+Sans", "wght@800", `${brand.tagline}${brand.descriptor}`.toUpperCase() + brand.tagline),
  ]);
  const fonts = [
    nusa && { name: "Wide", data: nusa, weight: 800 as const, style: "normal" as const },
    condensed && { name: "Condensed", data: condensed, weight: 800 as const, style: "normal" as const },
    jakarta && { name: "Jakarta", data: jakarta, weight: 800 as const, style: "normal" as const },
  ].filter((f): f is NonNullable<typeof f> => Boolean(f));

  const [first, second] = brand.nameParts;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        backgroundColor: C.stage,
        backgroundImage: `radial-gradient(circle at 0% 0%, rgba(34,102,217,0.42), transparent 55%), radial-gradient(circle at 100% 100%, rgba(247,134,31,0.16), transparent 50%)`,
        fontFamily: "Jakarta",
        color: C.kapas,
        overflow: "hidden",
      }}
    >
      {/* ghost round numeral: the numerals are the architecture */}
      <div
        style={{
          position: "absolute",
          right: -30,
          bottom: -150,
          fontFamily: "Condensed",
          fontSize: 640,
          lineHeight: 1,
          letterSpacing: -18,
          color: "rgba(255,249,238,0.06)",
        }}
      >
        04
      </div>
      {/* parang slash */}
      <div
        style={{
          position: "absolute",
          left: 76,
          top: 0,
          width: 12,
          height: 630,
          backgroundColor: C.orange,
          transform: "skewX(-12deg)",
          opacity: 0.9,
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "76px 0 70px 130px",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <svg width="112" height="112" viewBox="0 0 48 48">
            <path d="M8 2 H36 L46 12 V34 Q46 46 34 46 H8 V41 H2 V8 Q2 2 8 2 Z" fill={C.orange} />
            {[0, 90, 180, 270].map((d) => (
              <path key={d} d={LOBE} transform={`rotate(${d} 24 24)`} fill={C.stage} />
            ))}
          </svg>
          <div style={{ display: "flex", alignItems: "baseline", fontSize: 128, lineHeight: 1 }}>
            <span style={{ fontFamily: "Wide", letterSpacing: -4 }}>{first}</span>
            <span style={{ fontFamily: "Condensed", color: C.orange, letterSpacing: -2 }}>{second}</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 58, lineHeight: 1.05, letterSpacing: -1 }}>{brand.tagline}</div>
          <div style={{ marginTop: 16, fontSize: 22, letterSpacing: 4.5, color: C.muted }}>
            {brand.descriptor.toUpperCase()}
          </div>
        </div>

        <div style={{ display: "flex", gap: 18 }}>
          {CHIPS.map((chip) => (
            <div
              key={chip.letter}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "10px 26px 10px 10px",
                backgroundColor: C.raised,
                borderRadius: "12px 0 24px 0",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 64,
                  height: 64,
                  backgroundColor: chip.fill,
                  borderRadius: "8px 0 18px 0",
                }}
              >
                <ChipSymbol kind={chip.kind} ink={chip.ink} />
              </div>
              <span style={{ fontFamily: "Condensed", fontSize: 48, lineHeight: 1, color: chip.fill }}>
                {chip.letter}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    { ...size, fonts },
  );
}
