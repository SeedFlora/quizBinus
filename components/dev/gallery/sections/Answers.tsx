"use client";

import { useState } from "react";
import { NusaAnswer, type AnswerState } from "@/components/game/NusaAnswer";
import { ANSWER_SLOTS, AnswerSymbol } from "@/components/game/AnswerSymbol";
import { OS_BATTLE } from "@/lib/seed/quizzes";
import { useT } from "@/lib/i18n/client";
import type { TranslationKey } from "@/lib/i18n/config";
import { FOCUS_RING, Specimen, Subhead } from "../primitives";

const QUESTION = OS_BATTLE.questions[0]!; // FCFS: realistic answer lengths
const REVEAL = { counts: [9, 29, 2, 0], correct: 1 };

/** Every phone state, each on a different slot so all four identities appear. */
const PHONE_STATES: Array<{
  state: AnswerState;
  label: TranslationKey;
  position: number;
  disabled?: boolean;
  focus?: boolean;
}> = [
  { state: "idle", label: "design.states.focus", position: 1, focus: true },
  { state: "selected", label: "design.states.selected", position: 2 },
  { state: "locked", label: "design.states.locked", position: 3 },
  { state: "correct", label: "design.states.correct", position: 1 },
  { state: "wrong-pick", label: "design.states.missed", position: 0 },
  { state: "dimmed", label: "design.states.dimmed", position: 2 },
  { state: "idle", label: "design.states.disabled", position: 3, disabled: true },
];

export function AnswersSection() {
  const t = useT();
  const [picked, setPicked] = useState<number | null>(null);
  const total = REVEAL.counts.reduce((a, b) => a + b, 0);

  return (
    <div className="grid gap-12">
      <div>
        <Subhead>{t("design.labels.phone")}</Subhead>
        <div className="grid gap-x-6 gap-y-7 sm:grid-cols-2 xl:grid-cols-3">
          {/* Live: hover, press and focus for real. */}
          <Specimen label={`${t("design.states.default")} · ${t("design.live")}`}>
            <NusaAnswer
              position={0}
              text={QUESTION.answers[0]!.text}
              state={picked === 0 ? "selected" : "idle"}
              onSelect={() => setPicked((p) => (p === 0 ? null : 0))}
              multi
            />
          </Specimen>
          {PHONE_STATES.map((s) => (
            <Specimen key={s.label} label={t(s.label)}>
              <div inert className="w-full" style={s.focus ? { filter: FOCUS_RING } : undefined}>
                <NusaAnswer
                  position={s.position}
                  text={QUESTION.answers[s.position]!.text}
                  state={s.state}
                  disabled={s.disabled}
                  static={false}
                />
              </div>
            </Specimen>
          ))}
        </div>
      </div>

      <div>
        <Subhead>
          {t("design.labels.host")} · {t("design.labels.reveal")}
        </Subhead>
        <div className="grid gap-[1.6vh]" inert>
          {QUESTION.answers.map((a, i) => (
            <NusaAnswer
              key={a.id}
              static
              size="host"
              position={i}
              order={i}
              text={a.text}
              state={i === REVEAL.correct ? "correct" : "dimmed"}
              share={REVEAL.counts[i]! / total}
              count={REVEAL.counts[i]}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function SymbolsSection() {
  const t = useT();
  const sizes = [12, 16, 20, 24, 32, 48];
  return (
    <div className="grid gap-10">
      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {ANSWER_SLOTS.map((slot) => (
          <li key={slot.letter} className="nf nf-md nf-solid flex items-center gap-4 p-4">
            <span
              className="nf nf-sm grid size-16 shrink-0 place-items-center"
              style={{ ["--nf-fill" as string]: slot.color, color: slot.ink }}
            >
              <AnswerSymbol kind={slot.symbol} size={38} />
            </span>
            <span>
              <span className="font-numeral block text-4xl leading-none" style={{ color: slot.color }}>
                {slot.letter}
              </span>
              <span className="mt-1 block text-sm font-extrabold text-kapas">{slot.name}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <Subhead>{t("design.labels.sizes")}</Subhead>
          <table className="text-kapas">
            <tbody>
              {ANSWER_SLOTS.map((slot) => (
                <tr key={slot.letter}>
                  <th scope="row" className="font-numeral pr-5 text-left text-2xl" style={{ color: slot.color }}>
                    {slot.letter}
                  </th>
                  {sizes.map((s) => (
                    <td key={s} className="px-2 py-2 align-middle">
                      <AnswerSymbol kind={slot.symbol} size={s} title={`${slot.name} ${s}px`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td />
                {sizes.map((s) => (
                  <td key={s} className="px-2 pt-2 font-mono text-[11px] text-stage-faint">
                    {s}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        <div>
          <Subhead>{t("design.labels.mono")}</Subhead>
          <div className="nf nf-md nf-outline flex items-center justify-around gap-4 px-6 py-8">
            {ANSWER_SLOTS.map((slot) => (
              <AnswerSymbol
                key={slot.letter}
                kind={slot.symbol}
                size={44}
                className="text-stage-muted"
                title={slot.name}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
