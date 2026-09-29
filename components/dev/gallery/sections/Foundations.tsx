"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion, type Transition } from "motion/react";
import { Music2, Volume2 } from "lucide-react";
import { NusaBadge } from "@/components/ui/NusaBadge";
import { NusaButton, NusaLink } from "@/components/ui/NusaButton";
import { NusaAnswer } from "@/components/game/NusaAnswer";
import { ease, lockKeyframes, lockTransition, shakeKeyframes, shakeTransition, transition } from "@/lib/motion";
import { getAudio, SOUND_CUES } from "@/lib/audio/engine";
import { OS_BATTLE } from "@/lib/seed/quizzes";
import { useT } from "@/lib/i18n/client";
import { contrastRatio, grade, parseColor, toHex, type Rgba } from "../contrast";
import { ReplayButton, Subhead, useReplay } from "../primitives";

/* ------------------------------------------------------------------ */
/* Typography                                                           */
/* ------------------------------------------------------------------ */

export function TypeSection() {
  const t = useT();
  const display: Array<{ token: string; spec: string; node: React.ReactNode }> = [
    {
      token: "text-mega",
      spec: "clamp(7rem, 22vw, 20rem)",
      node: <span className="font-numeral text-mega text-kapas">04</span>,
    },
    {
      token: "text-giga",
      spec: "clamp(4.5rem, 12vw, 11rem)",
      node: <span className="font-numeral text-giga text-sun">+850</span>,
    },
    {
      token: "text-hero",
      spec: "clamp(3rem, 8vw, 6.5rem)",
      node: <span className="font-numeral text-hero text-sun uppercase">{t("result.correct")}</span>,
    },
    {
      token: "text-title",
      spec: "clamp(2rem, 4vw, 3.5rem) · Jakarta 800",
      node: <span className="text-title font-extrabold text-balance text-kapas">{OS_BATTLE.questions[3]!.prompt}</span>,
    },
    {
      token: "font-display-wide",
      spec: "Bricolage wdth 100 · 800",
      node: (
        <span className="font-display-wide text-5xl leading-[0.9] text-kapas uppercase">{t("landing.heroLine1")}</span>
      ),
    },
    {
      token: "font-display-tight",
      spec: "Bricolage wdth 85 · 700",
      node: <span className="font-display-tight text-4xl leading-tight text-kapas">{t("join.profileTitle")}</span>,
    },
    {
      token: "hud-label",
      spec: "Jakarta 800 · 0.14em · caps",
      node: <span className="hud-label text-sm text-stage-muted">{t("host.answered")}</span>,
    },
  ];
  const interfaceSizes = [30, 24, 20, 18, 16, 14, 12];
  return (
    <div className="grid gap-12">
      <dl className="grid divide-y divide-stage-line">
        {display.map((row) => (
          <div key={row.token} className="grid items-baseline gap-x-8 gap-y-2 py-5 md:grid-cols-[13rem_minmax(0,1fr)]">
            <dt>
              <span className="block font-mono text-sm text-kapas">{row.token}</span>
              <span className="block font-mono text-xs text-stage-faint">{row.spec}</span>
            </dt>
            <dd className="min-w-0 overflow-hidden leading-[0.9]">{row.node}</dd>
          </div>
        ))}
      </dl>
      <div>
        <Subhead>Plus Jakarta Sans · 12–30</Subhead>
        <ul className="grid gap-3">
          {interfaceSizes.map((s) => (
            <li key={s} className="grid grid-cols-[3rem_minmax(0,1fr)] items-baseline gap-4">
              <span className="font-mono text-xs text-stage-faint">{s}</span>
              <span className="truncate font-semibold text-kapas" style={{ fontSize: s }}>
                {t("design.labels.sampleText")}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Colour tokens with contrast                                          */
/* ------------------------------------------------------------------ */

const TOKENS = [
  "binus-blue-950",
  "binus-blue-900",
  "binus-blue-700",
  "binus-blue-500",
  "binus-sky",
  "binus-orange",
  "binus-yellow",
  "nusantara-red",
  "nusantara-white",
  "state-miss",
  "success",
  "danger",
  "stage-muted",
  "stage-faint",
  "desk-muted",
] as const;

interface TokenRow {
  token: (typeof TOKENS)[number];
  color: Rgba | null;
  onStage: number;
  onKapas: number;
}

function useTokenRows(): TokenRow[] | null {
  const [rows, setRows] = useState<TokenRow[] | null>(null);
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const read = (name: string) => parseColor(css.getPropertyValue(`--${name}`));
    const stage = read("binus-blue-950");
    const kapas = read("nusantara-white");
    if (!stage || !kapas) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tokens can only be read from the live stylesheet
    setRows(
      TOKENS.map((token) => {
        const color = read(token);
        return {
          token,
          color,
          onStage: color ? contrastRatio(color, stage) : 0,
          onKapas: color ? contrastRatio(color, kapas) : 0,
        };
      }),
    );
  }, []);
  return rows;
}

function Ratio({ value }: { value: number }) {
  const t = useT();
  const g = grade(value);
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span className="tabular font-mono text-sm text-kapas">{value.toFixed(1)}:1</span>
      <NusaBadge size="sm" tone={g === "aa" ? "success" : g === "aaLarge" ? "neutral" : "miss"}>
        {t(`design.labels.${g}`)}
      </NusaBadge>
    </span>
  );
}

export function ColorSection() {
  const t = useT();
  const rows = useTokenRows();
  return (
    <div className="-mx-2 overflow-x-auto px-2">
      <table className="w-full min-w-[760px] text-left">
        <thead>
          <tr className="hud-label text-[10px] text-stage-faint">
            <th className="pb-3 font-extrabold">{t("design.labels.token")}</th>
            <th className="pb-3 font-extrabold">{t("design.labels.role")}</th>
            <th className="pb-3 font-extrabold">{t("design.labels.onStage")}</th>
            <th className="pb-3 font-extrabold">{t("design.labels.onKapas")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stage-line">
          {TOKENS.map((token) => {
            const row = rows?.find((r) => r.token === token);
            return (
              <tr key={token}>
                <td className="py-3 pr-6">
                  <span className="flex items-center gap-3">
                    <span
                      className="nf nf-sm size-11 shrink-0"
                      style={{ ["--nf-fill" as string]: `var(--${token})` }}
                      aria-hidden="true"
                    />
                    <span>
                      <span className="block font-mono text-sm text-kapas">--{token}</span>
                      <span className="block font-mono text-xs text-stage-faint">
                        {row?.color ? toHex(row.color) : "…"}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="py-3 pr-6 text-sm text-stage-muted">{t(`design.tokenRoles.${token}`)}</td>
                <td className="py-3 pr-6">{row ? <Ratio value={row.onStage} /> : null}</td>
                <td className="py-3">{row ? <Ratio value={row.onKapas} /> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Motion                                                               */
/* ------------------------------------------------------------------ */

const bezier = (e: readonly number[]) => `cubic-bezier(${e.join(", ")})`;

const MOTION_ROWS: Array<{
  key: "micro" | "system" | "game" | "celebration";
  range: string;
  curve: string;
  demo: Transition;
}> = [
  {
    key: "micro",
    range: "100–180 ms",
    curve: `spring ${transition.micro.stiffness}/${transition.micro.damping}`,
    demo: transition.micro,
  },
  { key: "system", range: "200–350 ms", curve: bezier(ease.outExpo), demo: transition.system },
  { key: "game", range: "400–800 ms", curve: bezier(ease.inOutQuint), demo: transition.game },
  {
    key: "celebration",
    range: "800–1800 ms",
    curve: `spring ${transition.celebration.stiffness}/${transition.celebration.damping}`,
    demo: transition.celebration,
  },
];

export function MotionSection() {
  const t = useT();
  const reduce = useReducedMotion();
  const { run, replay } = useReplay();
  return (
    <div className="grid gap-8">
      <div className="flex justify-end">
        <ReplayButton onClick={replay} />
      </div>
      <ul className="grid divide-y divide-stage-line" key={run}>
        {MOTION_ROWS.map((row) => (
          <li key={row.key} className="grid items-center gap-x-8 gap-y-3 py-4 md:grid-cols-[10rem_14rem_minmax(0,1fr)]">
            <div>
              <p className="hud-label text-kapas">{row.key}</p>
              <p className="mt-1 text-xs text-stage-faint">{t(`design.motionRows.${row.key}`)}</p>
            </div>
            <div className="font-mono text-xs">
              <p className="text-stage-muted">{row.range}</p>
              <p className="mt-1 text-stage-faint">{row.curve}</p>
            </div>
            {/* The track shows the curve's character: snap, glide, weighted, overshoot. */}
            <div className="relative h-11 overflow-hidden rounded-[6px_2px_12px_2px] bg-kapas/5">
              <div className="absolute inset-y-0 right-[2.375rem] left-1.5">
                <motion.span
                  className="nf nf-sm nf-sun absolute top-1.5 block size-8"
                  initial={{ left: "0%" }}
                  animate={{ left: "100%" }}
                  transition={reduce ? { duration: 0 } : { ...row.demo, delay: 0.25 }}
                />
              </div>
            </div>
          </li>
        ))}
        <li className="grid items-center gap-x-8 gap-y-3 py-5 md:grid-cols-[24rem_minmax(0,1fr)]">
          <p className="text-sm text-stage-muted">{t("design.states.missed")} · 3 × 6 px · 360 ms</p>
          <motion.span
            className="inline-block justify-self-start"
            animate={shakeKeyframes}
            transition={{ ...shakeTransition, delay: 0.3 }}
          >
            <NusaBadge tone="miss" size="lg">
              {t("result.incorrect")}
            </NusaBadge>
          </motion.span>
        </li>
        <li className="grid items-center gap-x-8 gap-y-3 py-5 md:grid-cols-[24rem_minmax(0,1fr)]">
          <p className="text-sm text-stage-muted">{t("design.states.locked")} · 0.96 → 1.02 → 1 · 320 ms</p>
          <motion.div
            className="w-full max-w-[26rem]"
            animate={lockKeyframes}
            transition={{ ...lockTransition, delay: 0.3 }}
            inert
          >
            <NusaAnswer position={1} text={OS_BATTLE.questions[3]!.answers[1]!.text} state="locked" static={false} />
          </motion.div>
        </li>
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sound                                                                */
/* ------------------------------------------------------------------ */

export function SoundSection() {
  const t = useT();
  const [last, setLast] = useState<string | null>(null);
  return (
    <div className="grid gap-8">
      <div>
        <Subhead>SFX</Subhead>
        <div className="flex flex-wrap gap-3">
          {SOUND_CUES.map((cue) => (
            <NusaButton
              key={cue}
              variant={last === cue ? "sun" : "ghost"}
              size="sm"
              icon={<Volume2 size={16} aria-hidden="true" />}
              onClick={() => {
                getAudio().unlock();
                void getAudio().play(cue);
                setLast(cue);
              }}
              className="font-mono"
            >
              {cue}
            </NusaButton>
          ))}
        </div>
      </div>
      <div className="nf nf-md nf-solid flex flex-wrap items-center justify-between gap-4 p-5">
        <p className="flex items-center gap-3 font-bold text-kapas">
          <Music2 className="shrink-0 text-sun" size={22} aria-hidden="true" />
          {t("design.labels.musicLab")}
        </p>
        <NusaLink href="/lab/audio" variant="sun" size="sm">
          {t("design.toSoundLab")}
        </NusaLink>
      </div>
    </div>
  );
}
