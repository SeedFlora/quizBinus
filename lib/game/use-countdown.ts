"use client";

import { useEffect, useRef, useState } from "react";

export interface CountdownOptions {
  /** Epoch ms on the authority clock; null when not running. */
  deadlineAt: number | null;
  /** authorityNow - localNow, estimated from snapshot.serverNow. */
  clockOffsetMs?: number;
  paused?: boolean;
  pausedRemainingMs?: number | null;
  onExpire?: () => void;
}

/**
 * Seconds-resolution countdown against the authority clock. Re-renders only when
 * the whole-second value changes; `remainingRef` gives sub-second precision for
 * rAF-driven visuals (timer ring) without re-rendering React.
 */
export function useCountdown({ deadlineAt, clockOffsetMs = 0, paused, pausedRemainingMs, onExpire }: CountdownOptions) {
  const remainingRef = useRef(0);
  const expireRef = useRef(onExpire);
  const [seconds, setSeconds] = useState(() => {
    if (paused) return Math.ceil((pausedRemainingMs ?? 0) / 1000);
    if (deadlineAt === null) return 0;
    return Math.max(0, Math.ceil((deadlineAt - (Date.now() + clockOffsetMs)) / 1000));
  });

  useEffect(() => {
    expireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (paused) {
      remainingRef.current = pausedRemainingMs ?? 0;
      setSeconds(Math.ceil(remainingRef.current / 1000));
      return;
    }
    if (deadlineAt === null) {
      remainingRef.current = 0;
      setSeconds(0);
      return;
    }
    let raf = 0;
    let fired = false;
    let last = -1;
    const tick = () => {
      const remaining = Math.max(0, deadlineAt - (Date.now() + clockOffsetMs));
      remainingRef.current = remaining;
      const s = Math.ceil(remaining / 1000);
      if (s !== last) {
        last = s;
        setSeconds(s);
      }
      if (remaining <= 0) {
        if (!fired) {
          fired = true;
          expireRef.current?.();
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [deadlineAt, clockOffsetMs, paused, pausedRemainingMs]);

  return { seconds, remainingRef };
}
