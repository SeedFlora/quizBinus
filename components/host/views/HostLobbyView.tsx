"use client";

import { useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { Lock, LockOpen, Play, X } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { BinusLogo } from "@/components/brand/BinusLogo";
import { NusaAvatar } from "@/components/game/NusaAvatar";
import { NusaQRCode } from "@/components/game/NusaQRCode";
import { NusaRoomCodeDisplay } from "@/components/game/NusaRoomCode";
import { NusaButton } from "@/components/ui/NusaButton";
import { NusaBadge } from "@/components/ui/NusaBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { PublicPlayer, SessionSnapshot } from "@/lib/game/types";
import { useT } from "@/lib/i18n/client";

const MAX_BUBBLES = 64;

/**
 * Host lobby: the room PIN and QR are the headline; the lower half is the "arena
 * floor" where every student who joins pops in as a character bubble.
 */
export function HostLobbyView({
  snapshot,
  joinUrl,
  displayUrl,
  recentJoins,
  onStart,
  onToggleLock,
  onKick,
  starting,
}: {
  snapshot: SessionSnapshot;
  joinUrl: string;
  displayUrl: string;
  recentJoins: string[];
  onStart: () => void;
  onToggleLock: () => void;
  onKick: (player: PublicPlayer) => void;
  starting?: boolean;
}) {
  const t = useT();
  const reduce = useReducedMotion();
  const [kickTarget, setKickTarget] = useState<PublicPlayer | null>(null);
  const count = snapshot.players.length;
  const visible = snapshot.players.slice(-MAX_BUBBLES);
  const hidden = count - visible.length;
  const latest = recentJoins.length
    ? snapshot.players.find((p) => p.id === recentJoins[recentJoins.length - 1])
    : undefined;

  return (
    <div className="flex h-full flex-col">
      {/* top bar */}
      <header className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <Wordmark size="md" />
          <span className="h-8 w-px bg-stage-line" aria-hidden="true" />
          <div className="min-w-0">
            <p className="hud-label text-[clamp(11px,0.8vw,15px)] text-stage-muted">
              {snapshot.courseCode} · {snapshot.courseName}
            </p>
            <p className="mt-1 truncate text-[clamp(16px,1.3vw,24px)] font-extrabold text-kapas">
              {snapshot.quizTitle}
            </p>
          </div>
        </div>
        <BinusLogo height={40} />
      </header>

      {/* join instructions */}
      <section className="host-lobby-hero mt-[3vh] grid flex-none grid-cols-[minmax(0,1fr)_auto] items-center gap-[4vw]">
        <div>
          <p className="text-[clamp(18px,1.6vw,30px)] font-bold text-stage-muted">
            {t("host.joinAt")} <span className="text-kapas">{displayUrl}</span>
          </p>
          <NusaRoomCodeDisplay
            code={snapshot.roomCode}
            label={t("host.pinLabel")}
            className="mt-[2vh] [&_p]:text-[clamp(8rem,min(19vw,33vh),24rem)]"
          />
        </div>
        <div className="flex flex-col items-center gap-3">
          <NusaQRCode value={joinUrl} size="clamp(200px, 30vh, 400px)" label={`${t("host.orScan")}: ${joinUrl}`} />
          <p className="hud-label text-[clamp(11px,0.8vw,15px)] text-stage-muted">{t("host.orScan")}</p>
        </div>
      </section>

      {/* arena floor */}
      <section
        className="mt-[3vh] flex min-h-0 flex-1 flex-col border-t border-stage-line pt-[2.5vh]"
        aria-labelledby="ready-count"
      >
        <div className="flex items-end justify-between gap-6">
          <div className="min-w-0">
            <h2
              id="ready-count"
              className="font-numeral text-[clamp(3rem,6.2vw,7.5rem)] leading-[0.85] text-kapas"
              aria-live="polite"
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={count}
                  className="inline-block text-sun"
                  initial={reduce ? { opacity: 0 } : { y: "-40%", opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { y: "40%", opacity: 0 }}
                  transition={{ type: "spring", stiffness: 420, damping: 26 }}
                >
                  {count}
                </motion.span>
              </AnimatePresence>{" "}
              {t("host.readyLabel")}
            </h2>
            <p className="mt-2 text-[clamp(16px,1.25vw,24px)] font-semibold text-stage-muted">
              {latest ? t("host.justJoined", { name: latest.nickname }) : t("host.waitingPlayers")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            {snapshot.joinsLocked && (
              <NusaBadge tone="sun" size="lg" icon={<Lock size={18} aria-hidden="true" />}>
                {t("host.joinsLocked")}
              </NusaBadge>
            )}
            <NusaButton
              variant="ghost"
              size="lg"
              onClick={onToggleLock}
              icon={
                snapshot.joinsLocked ? <LockOpen size={20} aria-hidden="true" /> : <Lock size={20} aria-hidden="true" />
              }
            >
              {snapshot.joinsLocked ? t("host.unlockJoins") : t("host.lockJoins")}
            </NusaButton>
            <NusaButton
              size="xl"
              onClick={onStart}
              disabled={count === 0}
              loading={starting}
              icon={<Play size={28} fill="currentColor" aria-hidden="true" />}
            >
              {t("host.start")}
            </NusaButton>
          </div>
        </div>

        <LayoutGroup>
          <ul
            className="mt-[2.5vh] flex min-h-0 flex-1 flex-wrap content-start gap-[clamp(8px,0.7vw,14px)] overflow-hidden"
            aria-label={`${count} ${t("common.players")}`}
          >
            <AnimatePresence initial={false}>
              {visible.map((p) => (
                <motion.li
                  key={p.id}
                  layout={!reduce}
                  initial={reduce ? { opacity: 0 } : { scale: 0.2, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.4, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 520, damping: 22 }}
                  className="group nf nf-md nf-solid relative flex items-center gap-2.5 py-1.5 pr-5 pl-1.5"
                >
                  <NusaAvatar seed={p.avatarSeed} size={44} />
                  <span className="max-w-[14ch] truncate text-[clamp(15px,1.15vw,22px)] font-extrabold text-kapas">
                    {p.nickname}
                  </span>
                  <button
                    type="button"
                    onClick={() => setKickTarget(p)}
                    className="absolute -top-2 -right-2 hidden size-7 place-items-center rounded-full bg-kapas text-binus-950 group-focus-within:grid group-hover:grid"
                    aria-label={`${t("host.kick")} ${p.nickname}`}
                  >
                    <X size={16} strokeWidth={3} />
                  </button>
                </motion.li>
              ))}
              {hidden > 0 && (
                <li className="flex items-center px-4 text-[clamp(15px,1.15vw,22px)] font-extrabold text-stage-muted">
                  +{hidden}
                </li>
              )}
            </AnimatePresence>
          </ul>
        </LayoutGroup>
      </section>

      <ConfirmDialog
        open={Boolean(kickTarget)}
        title={kickTarget ? t("host.kickConfirm", { name: kickTarget.nickname }) : ""}
        confirmLabel={t("host.kick")}
        tone="danger"
        onCancel={() => setKickTarget(null)}
        onConfirm={() => {
          if (kickTarget) onKick(kickTarget);
          setKickTarget(null);
        }}
      />
    </div>
  );
}
