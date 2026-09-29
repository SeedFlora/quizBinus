"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Wordmark } from "@/components/brand/Wordmark";
import { BinusLogo } from "@/components/brand/BinusLogo";
import { NusaButton } from "@/components/ui/NusaButton";
import { NusaRoomCodeInput } from "@/components/game/NusaRoomCode";
import { PlayerShell } from "./PlayerShell";
import { QrScanner } from "./QrScanner";
import { isValidRoomCode, normalizeRoomInput, ROOM_CODE_LENGTH } from "@/lib/game/room-code";
import { providerFor } from "@/lib/realtime";
import { loadCredentialsByRoom } from "@/lib/realtime/credentials";
import type { RoomLookup } from "@/lib/realtime/types";
import { useT } from "@/lib/i18n/client";
import type { TranslationKey } from "@/lib/i18n/config";

const LOOKUP_ERRORS: Record<Exclude<RoomLookup["status"], "ok">, TranslationKey> = {
  not_found: "errors.invalidCode",
  ended: "errors.expired",
  full: "errors.full",
  locked: "errors.locked",
  rate_limited: "errors.rateLimited",
};

export function JoinScreen() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const deepLink = normalizeRoomInput(params.get("room") ?? "");
  const [code, setCode] = useState(deepLink);
  const [error, setError] = useState<string>();
  // A QR deep link starts in the checking state; no flash of an idle form.
  const [checking, setChecking] = useState(() => isValidRoomCode(deepLink));
  const [scanning, setScanning] = useState(params.get("scan") === "1");
  const autoChecked = useRef(false);

  /**
   * Resolve the PIN. Rejoins go straight back in; otherwise state only changes in
   * the promise callback, after the network answers.
   */
  const lookup = useCallback(
    (value: string) => {
      if (loadCredentialsByRoom(value)) {
        router.push(`/room/${value}/lobby`);
        return;
      }
      void providerFor(value)
        .resolveRoom(value)
        .then((result) => {
          if (result.status === "ok") {
            router.push(`/join/profile?room=${value}`);
            return;
          }
          setChecking(false);
          setError(t(LOOKUP_ERRORS[result.status]));
        });
    },
    [router, t],
  );

  const check = (value: string) => {
    if (!isValidRoomCode(value)) {
      setError(t("errors.invalidCodeHint"));
      return;
    }
    setChecking(true);
    setError(undefined);
    lookup(value);
  };

  // QR deep link: /join?room=XXXXXX checks immediately.
  useEffect(() => {
    if (autoChecked.current) return;
    autoChecked.current = true;
    if (isValidRoomCode(deepLink)) lookup(deepLink);
  }, [lookup, deepLink]);

  return (
    <PlayerShell pattern="grid" drift>
      <header className="flex items-center justify-between">
        <Link href="/" aria-label="NUSAQUEST">
          <Wordmark size="sm" />
        </Link>
        <BinusLogo height={24} />
      </header>

      <main className="flex flex-1 flex-col justify-center py-10">
        <h1 className="font-numeral text-[clamp(3.25rem,17vw,5rem)] leading-[0.85] text-kapas uppercase">
          {t("join.title")}
        </h1>

        <form
          className="mt-10"
          onSubmit={(e) => {
            e.preventDefault();
            check(code);
          }}
          noValidate
        >
          <NusaRoomCodeInput
            value={code}
            onChange={(v) => {
              setCode(v);
              setError(undefined);
            }}
            onComplete={(v) => check(v)}
            label={t("join.codeLabel")}
            hint={checking ? t("join.checking") : t("join.codeHint")}
            error={error}
            disabled={checking}
            autoFocus={!params.get("room") && !scanning}
          />

          <div className="mt-8 grid gap-3">
            <NusaButton
              type="submit"
              size="xl"
              block
              loading={checking}
              loadingLabel={t("join.checking")}
              disabled={code.length !== ROOM_CODE_LENGTH}
            >
              {t("join.cta")}
            </NusaButton>
            <NusaButton
              variant="ghost"
              size="lg"
              block
              icon={<ScanLine size={20} aria-hidden="true" />}
              onClick={() => setScanning(true)}
            >
              {t("join.scan")}
            </NusaButton>
          </div>
        </form>
      </main>

      <AnimatePresence>
        {scanning && (
          <motion.div
            className="fixed inset-0 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <QrScanner
              onClose={() => setScanning(false)}
              onCode={(value) => {
                setScanning(false);
                setCode(value);
                check(value);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </PlayerShell>
  );
}
