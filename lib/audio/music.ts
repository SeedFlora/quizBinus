/**
 * NusaMusic: procedural, adaptive game music. No audio files, no licences.
 *
 * Gamelan structure × arcade energy:
 *  - Tuning: true 5-tone slendro (octave split into five ~240-cent steps) for calm and
 *    celebratory moods; a pelog-bem subset (uneven steps) for tension.
 *  - Instruments: FM-synthesised saron/bonang (inharmonic 3.5 ratio → metallic strike),
 *    gong ageng (two beating low partials), kenong/kempul/kethuk, kendang (pitched
 *    "dhung" + slapped "tak"), plus an arcade triangle bass and noise hi-hats.
 *  - Form: a colotomic 16-beat cycle (gongan). The gong closes each cycle, kenong
 *    marks every 4 beats, kempul and kethuk punctuate between, and the balungan
 *    (core melody) walks one note per beat while the bonang elaborates on 16ths.
 *
 * Moods map to game phases. The "urgent" mood (final five seconds) raises tempo
 * and density, which the ear reads as pressure, independent of screen colour.
 */

export type MusicMood = "off" | "lobby" | "intro" | "question" | "urgent" | "results" | "podium";

type Tuning = (degree: number, octave?: number) => number;

/** 5-TET slendro on D4 (293.66 Hz). */
const slendro: Tuning = (d, o = 0) => 293.66 * 2 ** (o + d / 5);
/** Pelog bem subset (degrees 1 2 3 5 6), in cents from E4. */
const PELOG_CENTS = [0, 136, 286, 686, 786];
const pelog: Tuning = (d, o = 0) => {
  const oct = Math.floor(d / 5);
  const idx = ((d % 5) + 5) % 5;
  return 329.63 * 2 ** (o + oct + PELOG_CENTS[idx]! / 1200);
};

interface MoodSpec {
  tempo: number;
  tuning: Tuning;
  /** 16-beat balungan, scale degrees (may exceed 4 → next octave). */
  melody: number[];
  bonang: "none" | "mipil" | "imbal" | "run";
  kendang: "none" | "soft" | "drive" | "roll";
  hats: 0 | 8 | 16;
  bass: boolean;
  pad: boolean;
  colotomy: boolean;
  gain: number;
}

const MOODS: Record<Exclude<MusicMood, "off">, MoodSpec> = {
  lobby: {
    tempo: 92,
    tuning: slendro,
    melody: [2, 1, 2, 0, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2],
    bonang: "mipil",
    kendang: "soft",
    hats: 0,
    bass: true,
    pad: true,
    colotomy: true,
    gain: 0.8,
  },
  intro: {
    tempo: 128,
    tuning: pelog,
    melody: [0, 1, 2, 3, 4, 5, 6, 7, 3, 4, 5, 6, 7, 8, 9, 10],
    bonang: "run",
    kendang: "roll",
    hats: 16,
    bass: false,
    pad: false,
    colotomy: false,
    gain: 0.75,
  },
  question: {
    tempo: 118,
    tuning: pelog,
    melody: [0, 2, 1, 0, 3, 2, 4, 3, 1, 0, 2, 1, 3, 4, 2, 0],
    bonang: "imbal",
    kendang: "drive",
    hats: 8,
    bass: true,
    pad: false,
    colotomy: true,
    gain: 0.72,
  },
  urgent: {
    tempo: 142,
    tuning: pelog,
    melody: [3, 4, 3, 2, 4, 5, 4, 3, 5, 6, 5, 4, 6, 7, 6, 5],
    bonang: "imbal",
    kendang: "roll",
    hats: 16,
    bass: true,
    pad: false,
    colotomy: true,
    gain: 0.85,
  },
  results: {
    tempo: 104,
    tuning: slendro,
    melody: [4, 3, 4, 2, 3, 4, 5, 4, 2, 3, 4, 5, 6, 5, 4, 5],
    bonang: "mipil",
    kendang: "soft",
    hats: 8,
    bass: true,
    pad: true,
    colotomy: true,
    gain: 0.75,
  },
  podium: {
    tempo: 112,
    tuning: slendro,
    melody: [0, 2, 4, 5, 4, 5, 7, 9, 7, 5, 4, 5, 7, 9, 10, 10],
    bonang: "run",
    kendang: "drive",
    hats: 8,
    bass: true,
    pad: true,
    colotomy: true,
    gain: 0.85,
  },
};

const LOOKAHEAD_S = 0.12;
const TICK_MS = 25;
const STEPS_PER_BEAT = 4;
const CYCLE_STEPS = 16 * STEPS_PER_BEAT;

export class MusicEngine {
  private out: GainNode;
  private moodGain: GainNode;
  private noise: AudioBuffer;
  private mood: MusicMood = "off";
  private spec: MoodSpec | null = null;
  private step = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private volume = 0.2;

  constructor(private readonly ctx: BaseAudioContext) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.moodGain = ctx.createGain();
    this.moodGain.connect(this.out).connect(comp).connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  get currentMood() {
    return this.mood;
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.mood !== "off") this.out.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.15);
  }

  setMood(mood: MusicMood) {
    if (mood === this.mood) return;
    const t = this.ctx.currentTime;
    const prev = this.mood;
    this.mood = mood;

    if (mood === "off") {
      this.out.gain.setTargetAtTime(0, t, 0.25);
      setTimeout(() => this.mood === "off" && this.stopClock(), 1200);
      return;
    }

    const spec = MOODS[mood];
    // Short duck, then swap patterns on the next beat; the gong marks the new section.
    this.moodGain.gain.cancelScheduledValues(t);
    this.moodGain.gain.setTargetAtTime(0.25, t, 0.06);
    this.moodGain.gain.setTargetAtTime(spec.gain, t + 0.18, 0.12);
    this.spec = spec;
    this.out.gain.setTargetAtTime(this.volume, t, 0.2);

    if (prev === "off" || !this.timer) {
      this.step = 0;
      this.nextTime = t + 0.06;
      this.startClock();
    } else {
      // Snap to the next beat boundary so the new groove lands on the pulse.
      const toBeat = (STEPS_PER_BEAT - (this.step % STEPS_PER_BEAT)) % STEPS_PER_BEAT;
      this.step += toBeat;
    }
    if (spec.colotomy && mood !== "urgent") this.gong(this.nextTime, 0.9);
  }

  dispose() {
    this.stopClock();
    this.out.disconnect();
  }

  /**
   * Schedule `seconds` of a mood up-front, without the live clock. Used with an
   * OfflineAudioContext to render/verify music (see /lab/audio) or export files.
   */
  prerender(mood: Exclude<MusicMood, "off">, seconds: number) {
    const spec = MOODS[mood];
    this.mood = mood;
    this.spec = spec;
    this.moodGain.gain.value = spec.gain;
    this.out.gain.value = this.volume;
    const stepDur = 60 / spec.tempo / STEPS_PER_BEAT;
    this.step = 0;
    this.nextTime = 0.02;
    if (spec.colotomy) this.gong(this.nextTime, 0.9);
    while (this.nextTime < seconds) {
      this.playStep(spec, this.step % CYCLE_STEPS, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step += 1;
    }
  }

  /* ---------------------------------------------------------------- */
  /* clock                                                             */
  /* ---------------------------------------------------------------- */

  private startClock() {
    if (this.timer) return;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
  }

  private stopClock() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private schedule() {
    const spec = this.spec;
    if (!spec) return;
    const stepDur = 60 / spec.tempo / STEPS_PER_BEAT;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD_S) {
      this.playStep(spec, this.step % CYCLE_STEPS, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step += 1;
    }
  }

  /* ---------------------------------------------------------------- */
  /* arrangement                                                       */
  /* ---------------------------------------------------------------- */

  private playStep(spec: MoodSpec, s: number, t: number, stepDur: number) {
    const beat = Math.floor(s / STEPS_PER_BEAT);
    const sub = s % STEPS_PER_BEAT;
    const note = spec.melody[beat % spec.melody.length]!;
    const nextNote = spec.melody[(beat + 1) % spec.melody.length]!;
    const f = (d: number, o = 0) => spec.tuning(d, o);

    // Balungan (saron): one strike per beat.
    if (sub === 0) this.bell(t, f(note), 0.16, { ratio: 3.5, index: 2.4, decay: 0.9 });

    // Bonang elaboration.
    if (spec.bonang === "mipil" && sub % 2 === 0) {
      const alt = sub === 0 ? nextNote : note;
      this.bell(t, f(alt, 1), 0.07, { ratio: 3.9, index: 1.6, decay: 0.45 });
    } else if (spec.bonang === "imbal") {
      // Two interlocking voices: polos on even, sangsih on odd 16ths, anticipating the next note.
      const polos = [nextNote, nextNote + 1, nextNote, nextNote - 1][sub]!;
      this.bell(t, f(polos, 1), sub % 2 === 0 ? 0.075 : 0.055, { ratio: 3.9, index: 1.5, decay: 0.32 });
    } else if (spec.bonang === "run") {
      this.bell(t, f(note + sub, 1), 0.06, { ratio: 3.7, index: 1.4, decay: 0.28 });
    }

    // Colotomic punctuation over the 16-beat gongan.
    if (spec.colotomy && sub === 0) {
      if (beat === 15) this.gong(t + stepDur * 3.2, 0.75);
      if (beat % 4 === 3) this.bell(t, f(note, -1), 0.1, { ratio: 1.41, index: 0.8, decay: 1.4 }); // kenong
      if (beat === 5 || beat === 9 || beat === 13)
        this.bell(t, f(note, -1) * 0.75, 0.08, { ratio: 1.2, index: 0.6, decay: 1.1 }); // kempul
    }
    if (spec.colotomy && sub === 2 && beat % 2 === 1)
      this.bell(t, f(0, 1) * 1.5, 0.035, { ratio: 2.1, index: 0.5, decay: 0.18 }); // kethuk

    // Kendang.
    switch (spec.kendang) {
      case "soft":
        if (s % 16 === 0) this.dhung(t, 0.5);
        if (s % 16 === 10) this.tak(t, 0.25);
        break;
      case "drive":
        if (sub === 0 && beat % 2 === 0) this.dhung(t, 0.7);
        if (sub === 2) this.tak(t, 0.3);
        if (s % 16 === 14) this.tak(t, 0.4);
        break;
      case "roll":
        if (sub === 0) this.dhung(t, 0.65);
        else this.tak(t, 0.18 + sub * 0.05);
        break;
    }

    // Arcade layer.
    if (spec.hats === 16 || (spec.hats === 8 && sub % 2 === 0)) this.hat(t, sub === 0 ? 0.05 : 0.03);
    if (spec.bass && (sub === 0 || (sub === 3 && beat % 2 === 1)))
      this.bass(t, f(note, -2), stepDur * (sub === 0 ? 2.5 : 1));
    if (spec.pad && s % 32 === 0) this.pad(t, [f(note, -1), f(note + 2, -1), f(note + 4, -1)], stepDur * 30);
  }

  /* ---------------------------------------------------------------- */
  /* instruments                                                       */
  /* ---------------------------------------------------------------- */

  private bell(t: number, freq: number, vel: number, o: { ratio: number; index: number; decay: number }) {
    const { ctx } = this;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const amp = ctx.createGain();
    car.frequency.value = freq;
    mod.frequency.value = freq * o.ratio;
    modGain.gain.setValueAtTime(freq * o.index, t);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.02 + 0.01, t + o.decay * 0.5);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(vel, t + 0.003);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + o.decay);
    mod.connect(modGain).connect(car.frequency);
    car.connect(amp).connect(this.moodGain);
    car.start(t);
    mod.start(t);
    car.stop(t + o.decay + 0.05);
    mod.stop(t + o.decay + 0.05);
  }

  private gong(t: number, vel: number) {
    const { ctx } = this;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.22 * vel, t + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 4);
    amp.connect(this.moodGain);
    // Two close low partials beat against each other: the gong's "ombak" (wave).
    for (const [f, g] of [
      [65.4, 1],
      [66.1, 0.8],
      [131.5, 0.35],
      [196.8, 0.12],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = f;
      gain.gain.value = g;
      osc.connect(gain).connect(amp);
      osc.start(t);
      osc.stop(t + 4.1);
    }
  }

  private dhung(t: number, vel: number) {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.frequency.setValueAtTime(170, t);
    osc.frequency.exponentialRampToValueAtTime(62, t + 0.16);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.35 * vel, t + 0.004);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(amp).connect(this.moodGain);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  private tak(t: number, vel: number) {
    this.noiseHit(t, vel * 0.5, "bandpass", 1900, 1.4, 0.07);
  }

  private hat(t: number, vel: number) {
    this.noiseHit(t, vel, "highpass", 7200, 0.7, 0.035);
  }

  private noiseHit(t: number, vel: number, type: BiquadFilterType, freq: number, q: number, decay: number) {
    const { ctx } = this;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(vel, t + 0.002);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(filter).connect(amp).connect(this.moodGain);
    src.start(t, Math.random() * 0.5, decay + 0.02);
  }

  private bass(t: number, freq: number, dur: number) {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.12, dur));
    osc.connect(filter).connect(amp).connect(this.moodGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private pad(t: number, freqs: number[], dur: number) {
    const { ctx } = this;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 850;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.035, t + 0.8);
    amp.gain.setValueAtTime(0.035, t + dur - 0.9);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    filter.connect(amp).connect(this.moodGain);
    for (const f of freqs) {
      for (const detune of [-7, 7]) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = f;
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* preference                                                          */
/* ------------------------------------------------------------------ */

export const MUSIC_PREF_KEY = "nq-music";

/** Music defaults ON for the projector; the setting lives in /settings. */
export function isMusicEnabled(): boolean {
  try {
    return window.localStorage.getItem(MUSIC_PREF_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setMusicEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(MUSIC_PREF_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("nq-music-change"));
}
