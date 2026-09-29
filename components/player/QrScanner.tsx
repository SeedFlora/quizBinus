"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { NusaButton } from "@/components/ui/NusaButton";
import { useT } from "@/lib/i18n/client";
import { isValidRoomCode } from "@/lib/game/room-code";

interface Detector {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

/** Extracts a room PIN from a scanned value: a join URL (?room=) or bare digits. */
export function roomFromScan(value: string): string | null {
  try {
    const url = new URL(value);
    const room = url.searchParams.get("room");
    if (room && isValidRoomCode(room)) return room;
  } catch {
    /* not a URL */
  }
  const digits = value.replace(/\D/g, "");
  return isValidRoomCode(digits) ? digits : null;
}

/**
 * In-app QR scanning via the native BarcodeDetector (Chrome/Android, Safari 17+).
 * Where unavailable we say so plainly: the phone's camera app can open the QR's
 * join link directly, which lands on /join?room=… anyway.
 */
export function QrScanner({ onCode, onClose }: { onCode: (room: string) => void; onClose: () => void }) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  // The scanner only mounts after a tap (client-side), so capabilities can be read up front.
  const [unsupported, setUnsupported] = useState(
    () =>
      !(globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector ||
      !navigator.mediaDevices?.getUserMedia,
  );

  useEffect(() => {
    const Ctor = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (unsupported || !Ctor) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const detector = new Ctor({ formats: ["qr_code"] });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const loop = async () => {
          if (stopped || !video.current) return;
          try {
            const codes = await detector.detect(video.current);
            for (const c of codes) {
              const room = roomFromScan(c.rawValue);
              if (room) {
                onCode(room);
                return;
              }
            }
          } catch {
            /* frame not ready */
          }
          raf = requestAnimationFrame(() => void loop());
        };
        void loop();
      } catch {
        setUnsupported(true);
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onCode, unsupported]);

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-6 bg-night/95 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={t("join.scan")}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-[max(16px,env(safe-area-inset-top))] right-4 grid size-12 place-items-center rounded-full bg-kapas/10 text-kapas"
        aria-label={t("common.close")}
      >
        <X size={24} />
      </button>
      {unsupported ? (
        <div className="max-w-xs text-center">
          <p className="text-lg font-bold text-kapas">{t("join.scanUnsupported")}</p>
          <NusaButton variant="kapas" size="lg" className="mt-6" onClick={onClose}>
            {t("common.back")}
          </NusaButton>
        </div>
      ) : (
        <div
          className="nf nf-lg relative aspect-square w-full max-w-sm overflow-hidden"
          style={{ ["--nf-fill" as string]: "#000" }}
        >
          <video ref={video} className="nf-clip absolute inset-0 h-full w-full object-cover" playsInline muted />
          <div className="pointer-events-none absolute inset-[18%] border-2 border-dashed border-sun" />
        </div>
      )}
    </div>
  );
}
