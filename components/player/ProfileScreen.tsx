"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Shuffle } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { NusaButton } from "@/components/ui/NusaButton";
import { NusaAvatar } from "@/components/game/NusaAvatar";
import { PlayerShell } from "./PlayerShell";
import { providerFor } from "@/lib/realtime";
import { loadProfile, saveCredentials, saveProfile } from "@/lib/realtime/credentials";
import type { JoinResult, RoomLookup } from "@/lib/realtime/types";
import { isValidRoomCode, formatRoomCode } from "@/lib/game/room-code";
import { NICKNAME_MAX, sanitizeNickname } from "@/lib/validation/nickname";
import { useT } from "@/lib/i18n/client";
import type { TranslationKey } from "@/lib/i18n/config";
import { getAudio, haptic } from "@/lib/audio/engine";

type JoinError = Extract<JoinResult, { ok: false }>["error"];
const JOIN_ERRORS: Record<JoinError, TranslationKey> = {
  not_found: "errors.invalidCode",
  ended: "errors.expired",
  locked: "errors.locked",
  full: "errors.full",
  nickname_taken: "errors.nicknameTaken",
  kicked: "errors.kicked",
  invalid_nickname: "errors.nicknameInvalid",
  blocked_nickname: "errors.nicknameBlocked",
  rate_limited: "errors.rateLimited",
  network: "errors.network",
};

const newSeed = () => Math.random().toString(36).slice(2, 10);

export function ProfileScreen() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const reduce = useReducedMotion();
  const inputId = useId();
  const room = params.get("room") ?? "";
  const [room_, setRoomInfo] = useState<Extract<RoomLookup, { status: "ok" }> | null>(null);
  const [nickname, setNickname] = useState("");
  const [seed, setSeed] = useState("nusa");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const saved = loadProfile();
    /* eslint-disable react-hooks/set-state-in-effect -- hydrate from device storage after mount */
    // Never overwrite what the student already typed (slow phones hydrate late).
    setNickname((current) => current || saved?.nickname || "");
    setSeed(saved?.avatarSeed ?? newSeed());
    /* eslint-enable react-hooks/set-state-in-effect */
    if (!isValidRoomCode(room)) {
      router.replace("/join");
      return;
    }
    void providerFor(room)
      .resolveRoom(room)
      .then((r) => (r.status === "ok" ? setRoomInfo(r) : router.replace(`/join?room=${room}`)));
  }, [room, router]);

  const submit = async () => {
    const check = sanitizeNickname(nickname);
    if (!check.ok) {
      setError(t(check.reason === "blocked" ? "errors.nicknameBlocked" : "errors.nicknameInvalid"));
      return;
    }
    setPending(true);
    setError(undefined);
    const result = await providerFor(room).joinSession({ roomCode: room, nickname: check.value, avatarSeed: seed });
    if (!result.ok) {
      setPending(false);
      setError(t(JOIN_ERRORS[result.error]));
      return;
    }
    saveCredentials(result.credentials);
    saveProfile({ nickname: check.value, avatarSeed: seed });
    haptic(15);
    void getAudio().play("join");
    router.push(`/room/${room}/lobby`);
  };

  return (
    <PlayerShell pattern="grid">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="hud-label text-stage-muted">{formatRoomCode(room)}</p>
          <p className="mt-1.5 truncate text-sm font-bold text-kapas">
            {room_ ? t("join.roomFor", { course: `${room_.courseCode} ${room_.courseName}` }) : " "}
          </p>
        </div>
        {room_ && <span className="shrink-0 text-sm text-stage-muted">{room_.hostName}</span>}
      </header>

      <main className="flex flex-1 flex-col justify-center py-8">
        <h1 className="font-display-tight text-[2rem] leading-[1.02] text-balance text-kapas">
          {t("join.profileTitle")}
        </h1>

        <div className="mt-8 flex items-end gap-4">
          <div className="nf nf-lg nf-panel relative grid size-36 shrink-0 place-items-center">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={seed}
                initial={reduce ? { opacity: 0 } : { scale: 0.4, rotate: -20, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                exit={reduce ? { opacity: 0 } : { scale: 0.4, rotate: 20, opacity: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 20 }}
              >
                <NusaAvatar seed={seed} size={104} label={t("join.avatarLabel")} />
              </motion.span>
            </AnimatePresence>
          </div>
          <NusaButton
            variant="ghost"
            size="md"
            icon={<Shuffle size={18} aria-hidden="true" />}
            onClick={() => setSeed(newSeed())}
          >
            {t("join.shuffleAvatar")}
          </NusaButton>
        </div>

        <form
          className="mt-8"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          noValidate
        >
          <label htmlFor={inputId} className="hud-label mb-3 block text-stage-muted">
            {t("join.nicknameLabel")}
          </label>
          <div
            className={`nf nf-md nf-outline ${error ? "[--nf-stroke:var(--danger)]" : "focus-within:[--nf-stroke:var(--binus-yellow)]"}`}
            style={{ ["--nf-stroke-w" as string]: "2px" }}
          >
            <input
              id={inputId}
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value.slice(0, NICKNAME_MAX + 4));
                setError(undefined);
              }}
              maxLength={NICKNAME_MAX + 4}
              autoComplete="nickname"
              autoCapitalize="words"
              enterKeyHint="go"
              placeholder={t("join.nicknamePlaceholder")}
              aria-invalid={Boolean(error)}
              aria-describedby={`${inputId}-hint`}
              className="h-16 w-full bg-transparent px-5 text-xl font-bold text-kapas outline-none placeholder:text-kapas/30"
            />
          </div>
          <p
            id={`${inputId}-hint`}
            className={error ? "mt-3 text-sm font-semibold text-[#ffb4ab]" : "mt-3 text-sm text-stage-muted"}
            role={error ? "alert" : undefined}
          >
            {error ?? t("join.nicknameHint")}
          </p>

          <NusaButton
            type="submit"
            size="xl"
            block
            className="mt-8"
            loading={pending}
            loadingLabel={t("join.joining")}
            disabled={!room_ || nickname.trim().length < 2}
          >
            {t("join.joinCta")}
          </NusaButton>
        </form>
      </main>
    </PlayerShell>
  );
}
