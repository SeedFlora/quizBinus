"use client";

import { useEffect, useRef, useState } from "react";
import { Music2, Square, Volume2 } from "lucide-react";
import { NusaButton } from "@/components/ui/NusaButton";
import { StageBackground } from "@/components/brand/StageBackground";
import { getAudio, SOUND_CUES } from "@/lib/audio/engine";
import { MusicEngine, type MusicMood } from "@/lib/audio/music";

const MOODS: Exclude<MusicMood, "off">[] = ["lobby", "intro", "question", "urgent", "results", "podium"];

interface RenderReport {
  mood: string;
  peak: number;
  rms: number;
  ok: boolean;
}

/** Offline render of each mood: proves the synth graph produces sane, unclipped audio. */
async function renderCheck(seconds = 6): Promise<RenderReport[]> {
  const reports: RenderReport[] = [];
  for (const mood of MOODS) {
    const ctx = new OfflineAudioContext(1, 22050 * seconds, 22050);
    const engine = new MusicEngine(ctx);
    engine.setVolume(0.2);
    engine.prerender(mood, seconds - 0.5);
    const buffer = await ctx.startRendering();
    const data = buffer.getChannelData(0);
    let peak = 0;
    let sum = 0;
    let finite = true;
    for (let i = 0; i < data.length; i++) {
      const v = data[i]!;
      if (!Number.isFinite(v)) finite = false;
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    reports.push({ mood, peak, rms, ok: finite && peak < 1 && rms > 0.002 });
  }
  return reports;
}

/**
 * /lab/audio: audition every SFX cue and music mood, and run a render check.
 * A tool for the team replacing or tuning sounds; not linked from the product.
 */
export function SoundLab() {
  const engine = useRef<MusicEngine | null>(null);
  const [mood, setMood] = useState<MusicMood>("off");
  const [reports, setReports] = useState<RenderReport[] | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const off = getAudio().onUnlock((ctx) => {
      engine.current ??= new MusicEngine(ctx);
    });
    return () => {
      off();
      engine.current?.dispose();
    };
  }, []);

  const play = (next: MusicMood) => {
    getAudio().unlock();
    engine.current ??= getAudio().context() ? new MusicEngine(getAudio().context()!) : null;
    engine.current?.setMood(next);
    setMood(next);
  };

  return (
    <div className="stage isolate min-h-dvh px-6 py-10 sm:px-12">
      <StageBackground pattern="kawung" intensity="quiet" />
      <h1 className="font-numeral text-7xl text-kapas uppercase">Sound lab</h1>
      <p className="mt-3 max-w-[60ch] text-stage-muted">
        Procedural music (slendro/pelog, FM gamelan instruments + arcade layer) and SFX cues. Drop files into
        public/audio and list them in manifest.json to override any cue.
      </p>

      <section className="mt-10">
        <h2 className="hud-label text-stage-muted">Music moods</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {MOODS.map((m) => (
            <NusaButton
              key={m}
              variant={mood === m ? "sun" : "ghost"}
              icon={<Music2 size={18} aria-hidden="true" />}
              onClick={() => play(m)}
              aria-pressed={mood === m}
            >
              {m}
            </NusaButton>
          ))}
          <NusaButton variant="kapas" icon={<Square size={16} aria-hidden="true" />} onClick={() => play("off")}>
            stop
          </NusaButton>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="hud-label text-stage-muted">SFX cues</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {SOUND_CUES.map((cue) => (
            <NusaButton
              key={cue}
              variant="ghost"
              size="sm"
              icon={<Volume2 size={16} aria-hidden="true" />}
              onClick={() => {
                getAudio().unlock();
                void getAudio().play(cue);
              }}
            >
              {cue}
            </NusaButton>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="hud-label text-stage-muted">Render check</h2>
        <NusaButton
          className="mt-4"
          loading={checking}
          onClick={async () => {
            setChecking(true);
            setReports(await renderCheck());
            setChecking(false);
          }}
        >
          Render all moods offline
        </NusaButton>
        {reports && (
          <table className="mt-6 w-full max-w-xl text-left text-sm text-kapas" data-testid="render-report">
            <thead className="text-stage-muted">
              <tr>
                <th className="py-2">mood</th>
                <th>peak</th>
                <th>rms</th>
                <th>status</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.mood} className="border-t border-stage-line">
                  <td className="py-2 font-bold">{r.mood}</td>
                  <td className="tabular">{r.peak.toFixed(3)}</td>
                  <td className="tabular">{r.rms.toFixed(4)}</td>
                  <td className={r.ok ? "font-bold text-success" : "font-bold text-danger"}>{r.ok ? "ok" : "check"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
