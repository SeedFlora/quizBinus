/**
 * Audio abstraction. No AudioContext is created until the first user gesture, so
 * nothing ever autoplays. Cues listed in public/audio/manifest.json play
 * `/audio/<cue>.mp3`; every other cue plays a tiny synthesized tone. To replace a
 * sound, drop the file in public/audio/ and add its name to the manifest.
 */

export const SOUND_CUES = [
  "join",
  "countdown",
  "answer-lock",
  "correct",
  "incorrect",
  "rank-up",
  "streak",
  "round-end",
  "winner",
] as const;
export type SoundCue = (typeof SOUND_CUES)[number];

const MUTE_KEY = "nq-muted";

type Note = { f: number; t: number; d: number; type?: OscillatorType; g?: number };

// Short, friendly synth sketches: pentatonic-ish, never harsh.
const SYNTH: Record<SoundCue, Note[]> = {
  join: [
    { f: 660, t: 0, d: 0.09 },
    { f: 990, t: 0.07, d: 0.12 },
  ],
  countdown: [{ f: 880, t: 0, d: 0.06, type: "square", g: 0.05 }],
  "answer-lock": [
    { f: 520, t: 0, d: 0.05, type: "triangle" },
    { f: 780, t: 0.04, d: 0.08, type: "triangle" },
  ],
  correct: [
    { f: 784, t: 0, d: 0.1 },
    { f: 988, t: 0.08, d: 0.1 },
    { f: 1319, t: 0.16, d: 0.22 },
  ],
  incorrect: [
    { f: 392, t: 0, d: 0.12, type: "triangle" },
    { f: 330, t: 0.1, d: 0.18, type: "triangle" },
  ],
  "rank-up": [
    { f: 587, t: 0, d: 0.08 },
    { f: 740, t: 0.07, d: 0.08 },
    { f: 880, t: 0.14, d: 0.14 },
  ],
  streak: [
    { f: 880, t: 0, d: 0.06, type: "sawtooth", g: 0.04 },
    { f: 1175, t: 0.05, d: 0.12, type: "sawtooth", g: 0.04 },
  ],
  "round-end": [
    { f: 523, t: 0, d: 0.14 },
    { f: 392, t: 0.12, d: 0.2 },
  ],
  winner: [
    { f: 523, t: 0, d: 0.12 },
    { f: 659, t: 0.12, d: 0.12 },
    { f: 784, t: 0.24, d: 0.12 },
    { f: 1047, t: 0.36, d: 0.4 },
  ],
};

class AudioEngine {
  private ctx: AudioContext | null = null;
  private buffers = new Map<SoundCue, AudioBuffer | null>();
  private muted = false;
  private listeners = new Set<(muted: boolean) => void>();

  constructor() {
    if (typeof window !== "undefined") {
      try {
        this.muted = window.localStorage.getItem(MUTE_KEY) === "1";
      } catch {
        this.muted = false;
      }
    }
  }

  private unlockListeners = new Set<(ctx: AudioContext) => void>();

  /** Call from a user gesture handler (tap/click/keydown). */
  unlock() {
    if (typeof window === "undefined" || this.ctx) {
      void this.ctx?.resume();
      return;
    }
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    const ctx = this.ctx;
    this.unlockListeners.forEach((l) => l(ctx));
  }

  /** The shared AudioContext once a gesture has unlocked audio (music reuses it). */
  context(): AudioContext | null {
    return this.ctx;
  }

  onUnlock(listener: (ctx: AudioContext) => void) {
    if (this.ctx) listener(this.ctx);
    this.unlockListeners.add(listener);
    return () => void this.unlockListeners.delete(listener);
  }

  isMuted() {
    return this.muted;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    try {
      window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      /* storage unavailable: keep in memory */
    }
    this.listeners.forEach((l) => l(muted));
  }

  onMuteChange(listener: (muted: boolean) => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  async play(cue: SoundCue) {
    if (this.muted || !this.ctx) return;
    const ctx = this.ctx;
    if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
    const buffer = await this.load(cue);
    if (buffer) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = 0.7;
      src.connect(gain).connect(ctx.destination);
      src.start();
      return;
    }
    this.synth(cue);
  }

  private manifest: Promise<Set<string>> | null = null;

  /** public/audio/manifest.json lists which cues have real files (avoids 404 probes). */
  private available(): Promise<Set<string>> {
    this.manifest ??= fetch("/audio/manifest.json", { cache: "force-cache" })
      .then((r) => (r.ok ? (r.json() as Promise<{ files?: string[] }>) : { files: [] }))
      .then((m) => new Set(m.files ?? []))
      .catch(() => new Set<string>());
    return this.manifest;
  }

  private async load(cue: SoundCue): Promise<AudioBuffer | null> {
    if (this.buffers.has(cue)) return this.buffers.get(cue) ?? null;
    this.buffers.set(cue, null);
    if (!(await this.available()).has(cue)) return null;
    try {
      const res = await fetch(`/audio/${cue}.mp3`, { cache: "force-cache" });
      if (!res.ok || !this.ctx) return null;
      const buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(cue, buffer);
      return buffer;
    } catch {
      return null;
    }
  }

  private synth(cue: SoundCue) {
    const ctx = this.ctx;
    if (!ctx) return;
    const start = ctx.currentTime + 0.01;
    for (const note of SYNTH[cue]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = note.type ?? "sine";
      osc.frequency.value = note.f;
      const peak = note.g ?? 0.08;
      gain.gain.setValueAtTime(0.0001, start + note.t);
      gain.gain.exponentialRampToValueAtTime(peak, start + note.t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + note.t + note.d);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start + note.t);
      osc.stop(start + note.t + note.d + 0.02);
    }
  }
}

let engine: AudioEngine | null = null;

export function getAudio(): AudioEngine {
  engine ??= new AudioEngine();
  return engine;
}

/** Short haptic tick where supported and permitted. Silently ignored elsewhere. */
export function haptic(pattern: number | number[] = 12) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    /* not allowed */
  }
}
