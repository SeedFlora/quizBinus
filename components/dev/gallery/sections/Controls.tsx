"use client";

import type { CSSProperties } from "react";
import { ArrowRight, Lock, Play } from "lucide-react";
import { NusaButton, type NusaButtonSize, type NusaButtonVariant } from "@/components/ui/NusaButton";
import { NusaBadge, type NusaBadgeTone } from "@/components/ui/NusaBadge";
import type { TranslationKey } from "@/lib/i18n/config";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";
import { FOCUS_RING, Specimen, Subhead } from "../primitives";

type ButtonState = "default" | "hover" | "focus" | "active" | "disabled" | "loading";
const BUTTON_STATES: ButtonState[] = ["default", "hover", "focus", "active", "disabled", "loading"];

/** Real product copy per variant, so specimens show real widths. */
const STAGE_VARIANTS: Array<{ variant: NusaButtonVariant; label: TranslationKey }> = [
  { variant: "energy", label: "join.cta" },
  { variant: "sun", label: "play.lockAnswer" },
  { variant: "blue", label: "creator.startSession" },
  { variant: "kapas", label: "common.retry" },
  { variant: "ghost", label: "lobby.leave" },
  { variant: "danger", label: "common.delete" },
];
const DESK_VARIANTS: Array<{ variant: NusaButtonVariant; label: TranslationKey }> = [
  { variant: "desk", label: "common.save" },
  { variant: "desk-quiet", label: "common.cancel" },
];

/** Forces a pseudo-class look without the pseudo-class, using the same CSS variables. */
function forced(state: ButtonState, desk: boolean): { style?: CSSProperties; pressed?: boolean } {
  if (state === "hover") return { style: { ["--nf-fill" as string]: "var(--btn-face-hover)" } };
  if (state === "focus")
    return { style: { filter: FOCUS_RING, ...(desk ? { ["--focus" as string]: "var(--binus-blue-500)" } : {}) } };
  if (state === "active") return { pressed: true };
  return {};
}

function ButtonMatrix({ variants, desk }: { variants: typeof STAGE_VARIANTS; desk?: boolean }) {
  const t = useT();
  return (
    <div className="-mx-2 overflow-x-auto px-2 pb-2">
      <table className="w-full min-w-[860px] border-separate border-spacing-x-3 border-spacing-y-4">
        <thead>
          <tr>
            <th className="w-24" />
            {BUTTON_STATES.map((s) => (
              <th
                key={s}
                scope="col"
                className={cn("hud-label text-left text-[10px]", desk ? "text-desk-muted" : "text-stage-faint")}
              >
                {t(`design.states.${s}`)}
                {s === "default" && (
                  <span className={cn("ml-1 tracking-normal normal-case", desk ? "text-binus-500" : "text-sun")}>
                    · {t("design.live")}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {variants.map(({ variant, label }) => (
            <tr key={variant}>
              <th
                scope="row"
                className={cn("text-left font-mono text-xs font-medium", desk ? "text-desk-muted" : "text-stage-muted")}
              >
                {variant}
              </th>
              {BUTTON_STATES.map((state) => {
                const f = forced(state, Boolean(desk));
                const live = state === "default";
                return (
                  // Forced states are inert: visible for review, out of the tab order and a11y tree.
                  <td key={state} inert={!live || undefined}>
                    <NusaButton
                      variant={variant}
                      size="md"
                      disabled={state === "disabled"}
                      loading={state === "loading"}
                      data-pressed={f.pressed ? "true" : undefined}
                      style={f.style}
                      className="whitespace-nowrap"
                    >
                      {t(label)}
                    </NusaButton>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ButtonsSection() {
  const t = useT();
  const sizes: NusaButtonSize[] = ["sm", "md", "lg", "xl"];
  return (
    <div className="grid gap-10">
      <ButtonMatrix variants={STAGE_VARIANTS} />
      <div>
        <Subhead>{t("design.labels.sizes")}</Subhead>
        <div className="flex flex-wrap items-end gap-5">
          {sizes.map((s) => (
            <Specimen key={s} label={s}>
              <NusaButton
                size={s}
                icon={
                  s === "xl" ? (
                    <Play size={26} fill="currentColor" aria-hidden="true" />
                  ) : (
                    <ArrowRight size={18} aria-hidden="true" />
                  )
                }
              >
                {s === "xl" ? t("host.start") : t("host.next")}
              </NusaButton>
            </Specimen>
          ))}
        </div>
      </div>
      <DeskPlate>
        <Subhead>{t("design.labels.desk")}</Subhead>
        <ButtonMatrix variants={DESK_VARIANTS} desk />
      </DeskPlate>
    </div>
  );
}

/** A light "desk" surface inside the dark gallery, with the creator focus ring. */
export function DeskPlate({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("nf nf-lg nf-desk", className)}>
      <div className="theme-desk bg-transparent p-5 sm:p-8">{children}</div>
    </div>
  );
}

const STAGE_TONES = ["solid", "panel", "outline", "ghost", "kapas", "energy", "sun"] as const;

export function FramesSection() {
  const t = useT();
  return (
    <div className="grid gap-10">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        {STAGE_TONES.map((tone) => (
          <Specimen key={tone} label={`nf-${tone}`}>
            <div
              className={cn(
                "nf nf-md grid h-24 w-full place-items-center font-mono text-xs",
                `nf-${tone}`,
                tone === "solid" || tone === "panel" || tone === "outline" || tone === "ghost"
                  ? "text-stage-muted"
                  : "",
              )}
            >
              {tone}
            </div>
          </Specimen>
        ))}
      </div>
      <div>
        <Subhead>{t("design.labels.sizes")}</Subhead>
        <div className="flex flex-wrap items-end gap-5">
          {(["sm", "md", "lg", "xl"] as const).map((size, i) => (
            <Specimen key={size} label={`nf-${size}`}>
              <div className={cn("nf nf-panel", `nf-${size}`)} style={{ width: 90 + i * 50, height: 60 + i * 34 }} />
            </Specimen>
          ))}
          <Specimen label={`nf-lg nf-flip · ${t("design.labels.flip")}`}>
            <div className="nf nf-lg nf-flip nf-sun h-[128px] w-[190px]" />
          </Specimen>
        </div>
      </div>
      <DeskPlate className="max-w-sm">
        <Specimen label="nf-desk">
          <div className="nf nf-md nf-desk grid h-24 w-56 place-items-center font-mono text-xs text-desk-muted">
            desk
          </div>
        </Specimen>
      </DeskPlate>
    </div>
  );
}

const STAGE_BADGES: NusaBadgeTone[] = ["neutral", "energy", "sun", "sky", "success", "celebrate", "miss"];

export function BadgesSection() {
  const t = useT();
  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-5">
        {STAGE_BADGES.map((tone) => (
          <Specimen key={tone} label={tone}>
            <NusaBadge tone={tone}>
              {tone === "sun"
                ? "×2 PTS"
                : tone === "celebrate"
                  ? t("podium.first")
                  : tone === "miss"
                    ? t("result.incorrect")
                    : "Round Robin"}
            </NusaBadge>
          </Specimen>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-5">
        {(["sm", "md", "lg"] as const).map((size) => (
          <Specimen key={size} label={size}>
            <NusaBadge size={size} tone="sun" icon={<Lock size={size === "lg" ? 18 : 12} aria-hidden="true" />}>
              {t("host.joinsLocked")}
            </NusaBadge>
          </Specimen>
        ))}
      </div>
      <DeskPlate className="max-w-sm">
        <div className="flex flex-wrap gap-6">
          <Specimen label="desk">
            <NusaBadge tone="desk">{t("sessions.ended")}</NusaBadge>
          </Specimen>
          <Specimen label="desk-primary">
            <NusaBadge tone="desk-primary">{t("sessions.live")}</NusaBadge>
          </Specimen>
        </div>
      </DeskPlate>
    </div>
  );
}
