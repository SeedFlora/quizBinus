"use client";

import { motion, useReducedMotion } from "motion/react";
import { LogOut } from "lucide-react";
import { NusaAvatar } from "@/components/game/NusaAvatar";
import { NusaButton } from "@/components/ui/NusaButton";
import { formatRoomCode } from "@/lib/game/room-code";
import type { SessionSnapshot } from "@/lib/game/types";
import { useT } from "@/lib/i18n/client";

/** "Siap bermain?": the student's own character on stage while the class fills up. */
export function PlayerLobbyView({
  snapshot,
  nickname,
  avatarSeed,
  onLeave,
}: {
  snapshot: SessionSnapshot;
  nickname: string;
  avatarSeed: string;
  onLeave: () => void;
}) {
  const t = useT();
  const reduce = useReducedMotion();
  const others = snapshot.players.filter((p) => p.avatarSeed !== avatarSeed).slice(-6);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="hud-label text-stage-muted">
            {snapshot.courseCode} · {formatRoomCode(snapshot.roomCode)}
          </p>
          <p className="mt-2 truncate text-base font-extrabold text-kapas">{snapshot.quizTitle}</p>
          <p className="mt-0.5 text-sm text-stage-muted">
            {t("lobby.hostLabel")}: {snapshot.hostName}
          </p>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center py-8 text-center">
        <motion.div
          className="relative"
          animate={reduce ? undefined : { y: [0, -8, 0] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="nf nf-xl nf-panel grid size-52 place-items-center">
            <NusaAvatar seed={avatarSeed} size={148} ring />
          </div>
        </motion.div>
        <p className="hud-label mt-8 text-stage-muted">{t("lobby.youAre")}</p>
        {/* Scales down so a 20-character name without spaces still fits a 320px screen. */}
        <p className="font-display-tight mt-2 max-w-full text-[clamp(1.5rem,8.4vw,1.875rem)] [overflow-wrap:anywhere] text-kapas">
          {nickname}
        </p>

        <h1 className="font-numeral mt-10 text-[clamp(3rem,16vw,4.5rem)] leading-[0.9] text-sun uppercase">
          {t("lobby.ready")}
        </h1>
        <p className="mt-3 max-w-[28ch] text-pretty text-stage-muted">{t("lobby.waitingHost")}</p>

        <div className="mt-8 flex items-center gap-3" aria-live="polite">
          <div className="flex -space-x-3">
            {others.map((p) => (
              <motion.span
                key={p.id}
                initial={reduce ? false : { scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 18 }}
              >
                <NusaAvatar seed={p.avatarSeed} size={36} />
              </motion.span>
            ))}
          </div>
          <span className="text-sm font-bold text-kapas">
            {t("lobby.playersIn", { count: snapshot.players.length })}
          </span>
        </div>
      </main>

      <footer className="grid gap-3">
        <p className="text-center text-xs text-stage-faint">{t("lobby.tip")}</p>
        <NusaButton
          variant="ghost"
          size="sm"
          onClick={onLeave}
          icon={<LogOut size={16} aria-hidden="true" />}
          className="mx-auto"
        >
          {t("lobby.leave")}
        </NusaButton>
      </footer>
    </div>
  );
}
