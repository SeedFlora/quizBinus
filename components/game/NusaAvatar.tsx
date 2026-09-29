import { memo } from "react";
import { cn } from "@/lib/cn";
import { hashString, pick, seededRandom } from "@/lib/random";

/**
 * Seeded geometric creature. Bodies come from the product's shape vocabulary
 * (orb, NUSA FRAME, kawung lobe, capsule, tumpal); faces are minimal. Avatars are
 * abstract characters, never depictions of people or ethnic groups.
 */

const BODIES = ["orb", "frame", "lobe", "capsule", "tumpal"] as const;
const EYES = ["dots", "visor", "cyclops", "sleepy", "wide"] as const;
const CRESTS = ["none", "parang", "kawung", "antenna", "none"] as const;
const BELLIES = ["none", "tenun", "stripe", "none"] as const;
const MOUTHS = ["smile", "none", "o", "grin"] as const;

const PALETTE = [
  { body: "#46B8F4", ink: "#061433", accent: "#FFC82E" },
  { body: "#F7861F", ink: "#1d0d00", accent: "#FFF9EE" },
  { body: "#FFC82E", ink: "#061433", accent: "#2266D9" },
  { body: "#FFF9EE", ink: "#061433", accent: "#F7861F" },
  { body: "#2266D9", ink: "#FFF9EE", accent: "#FFC82E" },
  { body: "#35C9A8", ink: "#061433", accent: "#FFF9EE" },
  { body: "#FF8FA3", ink: "#061433", accent: "#FFF9EE" },
] as const;

export interface AvatarTraits {
  body: (typeof BODIES)[number];
  eyes: (typeof EYES)[number];
  crest: (typeof CRESTS)[number];
  belly: (typeof BELLIES)[number];
  mouth: (typeof MOUTHS)[number];
  palette: (typeof PALETTE)[number];
  tilt: number;
}

export function avatarTraits(seed: string): AvatarTraits {
  const rand = seededRandom(hashString(seed || "nusa"));
  return {
    body: pick(rand, BODIES),
    eyes: pick(rand, EYES),
    crest: pick(rand, CRESTS),
    belly: pick(rand, BELLIES),
    mouth: pick(rand, MOUTHS),
    palette: pick(rand, PALETTE),
    tilt: Math.round((rand() - 0.5) * 12),
  };
}

const BODY_PATHS: Record<AvatarTraits["body"], string> = {
  orb: "M32 10 a24 24 0 1 1 -0.01 0 Z",
  frame: "M18 12 H46 L56 22 V48 Q56 58 46 58 H16 V54 H10 V20 Q10 12 18 12 Z",
  lobe: "M32 7 C 50 14, 58 34, 45 52 Q 32 64 19 52 C 6 34, 14 14, 32 7 Z",
  capsule: "M32 8 Q50 8 50 26 V42 Q50 58 32 58 Q14 58 14 42 V26 Q14 8 32 8 Z",
  tumpal: "M32 7 L56 52 Q58 58 51 58 H13 Q6 58 8 52 Z",
};

function Eyes({ kind, ink, y }: { kind: AvatarTraits["eyes"]; ink: string; y: number }) {
  switch (kind) {
    case "dots":
      return (
        <g fill={ink}>
          <circle cx="25" cy={y} r="3.4" />
          <circle cx="39" cy={y} r="3.4" />
        </g>
      );
    case "visor":
      return (
        <g>
          <rect x="18" y={y - 5} width="28" height="10" rx="5" fill={ink} />
          <circle cx="26" cy={y} r="2.2" fill="#FFF9EE" />
          <circle cx="38" cy={y} r="2.2" fill="#FFF9EE" />
        </g>
      );
    case "cyclops":
      return (
        <g>
          <circle cx="32" cy={y} r="7" fill="#FFF9EE" />
          <circle cx="33.5" cy={y + 0.5} r="3.6" fill="#061433" />
        </g>
      );
    case "sleepy":
      return (
        <g stroke={ink} strokeWidth="2.6" strokeLinecap="round" fill="none">
          <path d={`M21 ${y} q4 3.5 8 0`} />
          <path d={`M35 ${y} q4 3.5 8 0`} />
        </g>
      );
    case "wide":
      return (
        <g>
          <circle cx="24.5" cy={y} r="5" fill="#FFF9EE" />
          <circle cx="39.5" cy={y} r="5" fill="#FFF9EE" />
          <circle cx="25.5" cy={y + 1} r="2.4" fill="#061433" />
          <circle cx="40.5" cy={y + 1} r="2.4" fill="#061433" />
        </g>
      );
  }
}

function Mouth({ kind, ink, y }: { kind: AvatarTraits["mouth"]; ink: string; y: number }) {
  switch (kind) {
    case "smile":
      return <path d={`M27 ${y} q5 4.5 10 0`} stroke={ink} strokeWidth="2.4" strokeLinecap="round" fill="none" />;
    case "o":
      return <ellipse cx="32" cy={y + 1} rx="2.6" ry="3" fill={ink} />;
    case "grin":
      return <path d={`M25 ${y - 1} h14 q-1 6 -7 6 q-6 0 -7 -6 Z`} fill={ink} />;
    default:
      return null;
  }
}

function Crest({ kind, accent }: { kind: AvatarTraits["crest"]; accent: string }) {
  switch (kind) {
    case "parang":
      return (
        <g fill={accent}>
          <path d="M24 10 L29 0 H33 L28 10 Z" />
          <path d="M31 10 L36 0 H40 L35 10 Z" />
        </g>
      );
    case "kawung":
      return (
        <g fill={accent}>
          <circle cx="32" cy="4" r="4" />
        </g>
      );
    case "antenna":
      return (
        <g>
          <path d="M32 10 V3" stroke={accent} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M32 0.5 l2.5 2.5 l-2.5 2.5 l-2.5 -2.5 Z" fill={accent} />
        </g>
      );
    default:
      return null;
  }
}

function Belly({ kind, accent, clipId }: { kind: AvatarTraits["belly"]; accent: string; clipId: string }) {
  if (kind === "none") return null;
  return (
    <g clipPath={`url(#${clipId})`} opacity="0.9">
      {kind === "stripe" && <rect x="0" y="47" width="64" height="5" fill={accent} />}
      {kind === "tenun" && (
        <g fill={accent}>
          {[14, 23, 32, 41, 50].map((x) => (
            <path key={x} d={`M${x} 46 l3.5 3.5 l-3.5 3.5 l-3.5 -3.5 Z`} />
          ))}
        </g>
      )}
    </g>
  );
}

export interface NusaAvatarProps {
  seed: string;
  size?: number;
  className?: string;
  /** Accessible name. Omit when the nickname is shown next to the avatar. */
  label?: string;
  /** Highlight ring for "this is you". */
  ring?: boolean;
}

export const NusaAvatar = memo(function NusaAvatar({ seed, size = 48, className, label, ring }: NusaAvatarProps) {
  const t = avatarTraits(seed);
  const clipId = `av-${hashString(seed).toString(36)}`;
  const eyeY = t.body === "tumpal" ? 38 : 31;
  return (
    <svg
      viewBox="-2 -2 68 68"
      width={size}
      height={size}
      className={cn("shrink-0 overflow-visible", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={BODY_PATHS[t.body]} />
        </clipPath>
      </defs>
      {ring && <circle cx="32" cy="33" r="33" fill="none" stroke="var(--binus-yellow)" strokeWidth="3" />}
      <g transform={`rotate(${t.tilt} 32 34)`}>
        <Crest kind={t.crest} accent={t.palette.accent} />
        <path d={BODY_PATHS[t.body]} fill={t.palette.body} />
        {/* ground shadow inside body for depth */}
        <path
          d={BODY_PATHS[t.body]}
          fill="#061433"
          opacity="0.14"
          clipPath={`url(#${clipId})`}
          transform="translate(0 6)"
        />
        <path
          d={BODY_PATHS[t.body]}
          fill={t.palette.body}
          transform="translate(0 -1.5) scale(1 0.94)"
          style={{ transformOrigin: "32px 12px" }}
        />
        <Belly kind={t.belly} accent={t.palette.accent} clipId={clipId} />
        <Eyes kind={t.eyes} ink={t.palette.ink} y={eyeY} />
        <Mouth kind={t.mouth} ink={t.palette.ink} y={eyeY + 9} />
      </g>
    </svg>
  );
});
