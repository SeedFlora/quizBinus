import { AnswerSymbol, answerSlot } from "@/components/game/AnswerSymbol";
import { cn } from "@/lib/cn";

/**
 * An answer's identity on the lecturer's desk: the same navy chip and coloured
 * symbol students saw on their phones, followed by the letter. Symbol + letter
 * carry the meaning, so the chip still reads without colour perception.
 */
export function AnswerChip({
  slot,
  size = 36,
  withLetter = true,
  className,
}: {
  slot: number;
  size?: number;
  withLetter?: boolean;
  className?: string;
}) {
  const identity = answerSlot(slot);
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className="nf nf-sm nf-solid inline-grid place-items-center"
        style={{ width: size, height: size, color: identity.color }}
      >
        <AnswerSymbol kind={identity.symbol} size={Math.round(size * 0.58)} />
      </span>
      {withLetter && <span className="font-numeral text-[1.35em] leading-none text-desk-text">{identity.letter}</span>}
    </span>
  );
}
