"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ScanLine } from "lucide-react";
import { NusaButton, NusaLink } from "@/components/ui/NusaButton";
import { NusaRoomCodeInput } from "@/components/game/NusaRoomCode";
import { isValidRoomCode, ROOM_CODE_LENGTH } from "@/lib/game/room-code";
import { useT } from "@/lib/i18n/client";

/**
 * PIN entry right in the hero: most visitors are students holding a phone in class.
 * Works without JS too (GET form to /join).
 */
export function HeroJoinForm() {
  const t = useT();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const go = (value: string) => {
    if (!isValidRoomCode(value)) {
      setError(t("errors.invalidCodeHint"));
      return;
    }
    setPending(true);
    router.push(`/join?room=${value}`);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    go(code);
  };

  return (
    <form action="/join" method="get" onSubmit={submit} className="w-full max-w-[26rem]" noValidate>
      <NusaRoomCodeInput
        value={code}
        onChange={(v) => {
          setCode(v);
          setError(undefined);
        }}
        label={t("landing.joinLabel")}
        hint={t("landing.scanHint")}
        error={error}
        onComplete={go}
      />
      <input type="hidden" name="room" value={code} />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center sm:gap-4">
        <NusaButton
          type="submit"
          size="lg"
          loading={pending}
          disabled={code.length < ROOM_CODE_LENGTH && code.length > 0}
          className="col-span-2 sm:min-w-[15rem]"
        >
          {t("landing.joinCta")}
        </NusaButton>
        <NusaLink
          href="/join?scan=1"
          variant="ghost"
          size="md"
          className="sm:hidden"
          icon={<ScanLine size={18} aria-hidden="true" />}
        >
          {t("join.scan")}
        </NusaLink>
        <NusaLink href="/dashboard" variant="ghost" size="md" className="sm:min-h-[60px] sm:px-7 sm:text-lg">
          {t("landing.createCta")}
        </NusaLink>
      </div>
    </form>
  );
}
