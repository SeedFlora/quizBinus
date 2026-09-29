"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { Pause, Play } from "lucide-react";
import { StageBackground } from "@/components/brand/StageBackground";
import { PlayerQuestionView } from "@/components/player/views/PlayerQuestionView";
import { toPublicQuestion } from "@/lib/game/evaluate";
import type { Question } from "@/lib/game/types";
import { useT } from "@/lib/i18n/client";
import { IconButton } from "./ui";

/** Logical phone viewport; scaled down to fit the settings column. */
const PHONE_W = 375;
const PHONE_H = 760;
const BEZEL = 10;
const HOLD_AT_ZERO_MS = 1600;

const noop = () => undefined;

/**
 * Live phone preview built from the REAL player component, fed the same sanitised
 * PublicQuestion the engine sends (`toPublicQuestion`), so what the lecturer sees
 * cannot drift from what students get. The countdown loops to show how the chosen
 * time feels; it can be paused (and starts paused under reduced motion).
 */
export function PhonePreview({ question, index, total }: { question: Question; index: number; total: number }) {
  const t = useT();
  const reduce = useReducedMotion();
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.72);
  const [running, setRunning] = useState(!reduce);
  const [deadlineAt, setDeadlineAt] = useState<number | null>(null);

  // Fit the phone to the column width.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setScale(Math.min(1, entry.contentRect.width / (PHONE_W + BEZEL * 2)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Restart the countdown whenever the question or its timer changes, then loop.
  useEffect(() => {
    if (!running) return;
    const total = question.timeLimit * 1000;
    const start = () => setDeadlineAt(Date.now() + total);
    start();
    const loop = window.setInterval(start, total + HOLD_AT_ZERO_MS);
    return () => window.clearInterval(loop);
  }, [running, question.id, question.timeLimit]);

  const publicQuestion = useMemo(() => {
    const pq = toPublicQuestion(question, index, total, "preview");
    return pq.prompt.trim() ? pq : { ...pq, prompt: t("editor.previewEmpty") };
  }, [question, index, total, t]);

  const height = (PHONE_H + BEZEL * 2) * scale;

  return (
    <figure className="grid gap-3">
      <figcaption className="flex items-center justify-between gap-3">
        <span>
          <span className="block text-[13px] font-bold text-desk-muted">{t("editor.preview")}</span>
          <span className="block text-[12.5px] text-desk-faint">{t("editor.previewCaption")}</span>
        </span>
        <IconButton
          label={running ? t("editor.previewPause") : t("editor.previewPlay")}
          aria-pressed={running}
          icon={running ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
          onClick={() => setRunning((r) => !r)}
        />
      </figcaption>

      <div ref={frameRef} className="relative w-full" style={{ height }}>
        <p className="sr-only">{t("editor.previewLabel", { n: index + 1 })}</p>
        <div
          // `inert`: the preview is a picture of the controller, not a second one.
          inert
          className="nf nf-xl absolute top-0 left-1/2 origin-top [--nf-fill:var(--night)]"
          style={{
            width: PHONE_W + BEZEL * 2,
            height: PHONE_H + BEZEL * 2,
            padding: BEZEL,
            transform: `translateX(-50%) scale(${scale})`,
          }}
        >
          <div className="nf-clip stage relative isolate flex h-full flex-col overflow-hidden [--nf-br:64px] [--nf-cut:36px] [--nf-notch:12px] [--nf-tl:14px]">
            <StageBackground tone="focus" />
            <div className="relative flex flex-1 flex-col px-4 pt-5 pb-4">
              <PlayerQuestionView
                key={question.id}
                question={publicQuestion}
                deadlineAt={running ? deadlineAt : null}
                clockOffsetMs={0}
                paused={!running}
                pausedRemainingMs={question.timeLimit * 1000}
                submitted={null}
                onSubmit={noop}
              />
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}
