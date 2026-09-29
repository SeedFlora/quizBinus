import { AnswerSymbol, ANSWER_SLOTS } from "@/components/game/AnswerSymbol";
import { getT } from "@/lib/i18n/server";
import { cn } from "@/lib/cn";

/**
 * The real sequence of a class session: lecturer prepares → projector runs →
 * phones play. Laid out on a descending diagonal (parang rhythm), not as three
 * identical cards.
 */
export async function HowItFlows() {
  const t = await getT();
  const steps = [
    {
      n: "01",
      title: t("landing.howCreatorTitle"),
      body: t("landing.howCreatorBody"),
      visual: <DeskSketch />,
      tone: "nf-kapas",
      offset: "lg:mt-0",
    },
    {
      n: "02",
      title: t("landing.howHostTitle"),
      body: t("landing.howHostBody"),
      visual: <StageSketch />,
      tone: "nf-panel",
      offset: "lg:mt-16",
    },
    {
      n: "03",
      title: t("landing.howPlayerTitle"),
      body: t("landing.howPlayerBody"),
      visual: <PhoneSketch />,
      tone: "nf-solid",
      offset: "lg:mt-32",
    },
  ];

  return (
    <section aria-labelledby="how-title" className="relative mx-auto max-w-[1320px] px-4 pb-28 sm:px-8">
      <h2 id="how-title" className="font-display-tight max-w-[18ch] text-4xl leading-[0.95] text-kapas sm:text-5xl">
        {t("landing.howTitle")}
      </h2>
      <ol className="mt-12 grid gap-6 lg:grid-cols-3 lg:gap-8">
        {steps.map((s, i) => (
          <li
            key={s.n}
            className={cn(
              "nf nf-lg relative overflow-hidden p-7",
              s.tone,
              s.offset,
              i === 0 ? "text-binus-950" : "text-kapas",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "font-numeral pointer-events-none absolute -top-6 right-4 text-[9rem] leading-none",
                i === 0 ? "text-binus-950/[0.07]" : "text-kapas/[0.06]",
              )}
            >
              {s.n}
            </span>
            <div className="relative h-32">{s.visual}</div>
            <h3 className="font-display-tight mt-6 text-2xl">{s.title}</h3>
            <p className={cn("mt-2 max-w-[36ch] leading-relaxed", i === 0 ? "text-binus-950/70" : "text-stage-muted")}>
              {s.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DeskSketch() {
  return (
    <div className="flex h-full gap-3" aria-hidden="true">
      <div className="flex w-16 flex-col gap-1.5">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className={cn("h-6 rounded-[4px]", n === 2 ? "bg-binus-500" : "bg-binus-950/10")} />
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-2 rounded-md bg-white p-3 shadow-[0_1px_0_rgb(10_22_51/0.08)]">
        <div className="h-2.5 w-4/5 rounded-full bg-binus-950/80" />
        <div className="h-2 w-3/5 rounded-full bg-binus-950/15" />
        <div className="mt-auto grid grid-cols-2 gap-1.5">
          {ANSWER_SLOTS.map((s, i) => (
            <div
              key={s.letter}
              className={cn(
                "flex h-5 items-center gap-1 rounded-[3px] px-1",
                i === 1 ? "bg-success/25" : "bg-binus-950/5",
              )}
            >
              <span className="text-binus-950/70">
                <AnswerSymbol kind={s.symbol} size={11} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StageSketch() {
  return (
    <div className="flex h-full items-end justify-between" aria-hidden="true">
      <span className="font-numeral text-[5.5rem] leading-[0.8] text-kapas">04</span>
      <div className="flex flex-col items-end gap-2">
        <span className="hud-label text-[10px] text-stage-muted">34 / 42</span>
        <div className="flex gap-1">
          {ANSWER_SLOTS.map((s) => (
            <span
              key={s.letter}
              className="grid size-8 place-items-center rounded-[5px]"
              style={{ background: s.color, color: s.ink }}
            >
              <AnswerSymbol kind={s.symbol} size={16} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function PhoneSketch() {
  return (
    <div className="flex h-full flex-col gap-1.5" aria-hidden="true">
      {ANSWER_SLOTS.map((s, i) => (
        <div
          key={s.letter}
          className="flex h-7 items-center gap-2 rounded-[5px] pl-1"
          style={
            i === 3
              ? { background: s.color, color: s.ink, marginRight: 0 }
              : {
                  background: "rgb(255 249 238 / 0.06)",
                  marginRight: `${(3 - i) * 6}px`,
                  color: "var(--nusantara-white)",
                }
          }
        >
          <span
            className="grid size-5 place-items-center rounded-[3px]"
            style={{ background: i === 3 ? s.ink : s.color, color: i === 3 ? s.color : s.ink }}
          >
            <AnswerSymbol kind={s.symbol} size={12} />
          </span>
          <span className="font-numeral text-sm leading-none">{s.letter}</span>
        </div>
      ))}
    </div>
  );
}
