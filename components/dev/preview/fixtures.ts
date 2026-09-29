import "server-only";
import { z } from "zod";
import { demoSnapshot, simulateGame } from "@/lib/demo/simulate";
import { DEMO_PLAYERS, DEMO_SELF } from "@/lib/seed/players";
import { OS_BATTLE } from "@/lib/seed/quizzes";
import type { AnswerPayload, PublicPlayer, PublicQuestion, SessionSnapshot } from "@/lib/game/types";
import type { PreviewScreenId } from "./screens";
import type { PreviewFixture } from "./types";

/**
 * Screen fixtures driven by the REAL GameEngine (lib/demo/simulate.ts): scores,
 * ranks, distributions and streaks are internally consistent, and the player-side
 * data passes through the same snapshotFor() sanitizer the live game uses.
 */

const TOTAL = OS_BATTLE.questions.length;

/** Question number (1-based) each screen shows when no ?q= is given. */
const DEFAULT_Q: Partial<Record<PreviewScreenId, number>> = {
  "host-leaderboard": 6,
};
const FALLBACK_Q = 5; // "Race condition terjadi ketika…": long answers, a real misconception

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Search params are a boundary: parse each field on its own and ignore junk. */
const querySchema = z.object({
  q: z.coerce.number().int().min(1).max(TOTAL).optional().catch(undefined),
  t: z.coerce.number().int().min(0).max(120).optional().catch(undefined),
  stress: z.enum(["1"]).optional().catch(undefined),
  as: z.enum(["winner"]).optional().catch(undefined),
  variant: z.enum(["none"]).optional().catch(undefined),
});
export type PreviewQuery = z.infer<typeof querySchema>;

export function parsePreviewQuery(params: Record<string, string | string[] | undefined>): PreviewQuery {
  return querySchema.parse({
    q: first(params.q),
    t: first(params.t),
    stress: first(params.stress),
    as: first(params.as),
    variant: first(params.variant),
  });
}

/* ------------------------------------------------------------------ */
/* Stress roster: every nickname at or near the 20-character limit.     */
/* ------------------------------------------------------------------ */

const LONG_FIRST = [
  "Christian",
  "Gabriella",
  "Theodorus",
  "Anak Agung",
  "Stefanus",
  "Ni Putu Ayu",
  "Fransiskus",
  "Nur Aisyah",
  "Maximilian",
  "Priscilla",
  "Raden Ayu",
  "Yohanes",
  "Cornelia",
  "Kadek Dwi",
];
const LONG_LAST = [
  "Hadiwijaya",
  "Anastasya",
  "Kurniawan",
  "Wirawardana",
  "Kartika",
  "Rahmawati",
  "Tanujaya",
  "Wulandari",
  "Kusumawati",
  "Setiabudi",
  "Maharani",
  "Bramantyo",
  "Pratama",
  "Santoso",
  "Halimawan",
];
/** Worst realistic case for the viewer: 20 wide glyphs and no space to wrap at. */
const SELF_STRESS = "MuhammadRizkyPratama";

const STRESS_PLAYERS: PublicPlayer[] = (() => {
  const seen = new Set<string>();
  return DEMO_PLAYERS.map((p, i) => {
    if (p.id === DEMO_SELF.id) return { ...p, nickname: SELF_STRESS };
    const f = i % LONG_FIRST.length;
    const l = (f + 5 * Math.floor(i / LONG_FIRST.length)) % LONG_LAST.length;
    let name = `${LONG_FIRST[f]} ${LONG_LAST[l]}`.slice(0, 20).trimEnd();
    while (seen.has(name.toLowerCase())) name = `${name.slice(0, 19)}${seen.size % 10}`;
    seen.add(name.toLowerCase());
    return { ...p, nickname: name };
  });
})();

/* ------------------------------------------------------------------ */

/** Frozen authority clock; `t` rewinds it to leave exactly t seconds on the timer. */
function authorityNow(snapshot: SessionSnapshot, t: number | undefined): number {
  if (t === undefined || snapshot.deadlineAt === null) return snapshot.serverNow;
  return snapshot.deadlineAt - t * 1000;
}

function fallbackAnswer(q: PublicQuestion): AnswerPayload {
  const ids = q.answers.map((a) => a.id);
  switch (q.type) {
    case "multiple":
      return { kind: "choice", answerIds: ids.slice(0, q.selectCount ?? 2) };
    case "ordering":
      return { kind: "order", answerIds: ids };
    case "numeric":
      return { kind: "number", value: 42 };
    case "short_answer":
      return { kind: "text", value: "mutex" };
    default:
      return { kind: "choice", answerIds: [ids[1] ?? ids[0]!] };
  }
}

/**
 * Finds a real (engine-produced) round where the viewer missed or did not answer.
 * One full simulated game per salt covers every question, so the search is cheap.
 */
function findSelfOutcome(players: PublicPlayer[], want: "miss" | "none", preferred: number, pinned: boolean) {
  const salts = ["nusa", ...Array.from({ length: 120 }, (_, i) => `fixture-${i}`)];
  const order = pinned
    ? [preferred]
    : [preferred, ...Array.from({ length: TOTAL }, (_, i) => i + 1).filter((n) => n !== preferred)];
  for (const salt of salts) {
    const { engine } = simulateGame({ players, playedQuestions: TOTAL, stopAt: "finished", salt });
    for (const n of order) {
      const qid = OS_BATTLE.questions[n - 1]!.id;
      const r = engine.state.reveals[qid]?.results[DEMO_SELF.id];
      if (!r) continue;
      if (want === "none" ? !r.answered : r.answered && !r.isCorrect) return { salt, n };
    }
  }
  return { salt: "nusa", n: preferred };
}

export function buildFixture(screen: PreviewScreenId, query: PreviewQuery): PreviewFixture {
  const players = query.stress ? STRESS_PLAYERS : DEMO_PLAYERS;
  const self = players.find((p) => p.id === DEMO_SELF.id) ?? DEMO_SELF;
  const n = query.q ?? DEFAULT_Q[screen] ?? FALLBACK_Q;

  switch (screen) {
    case "player-lobby": {
      const snapshot = demoSnapshot({ players, playedQuestions: 0, stopAt: "lobby", as: "self" });
      return { screen, snapshot, nickname: self.nickname, avatarSeed: self.avatarSeed };
    }
    case "player-question": {
      const snapshot = demoSnapshot({
        players,
        playedQuestions: n - 1,
        stopAt: "question",
        answeredInOpenQuestion: 14,
        as: "self",
      });
      return { screen, snapshot, question: snapshot.question!, authorityNow: authorityNow(snapshot, query.t) };
    }
    case "player-waiting": {
      const snapshot = demoSnapshot({
        players,
        playedQuestions: n - 1,
        stopAt: "question",
        answeredInOpenQuestion: 31,
        as: "self",
      });
      const question = snapshot.question!;
      return { screen, snapshot, question, answer: snapshot.self?.currentAnswer ?? fallbackAnswer(question) };
    }
    case "player-result-correct": {
      const snapshot = demoSnapshot({ players, playedQuestions: n, stopAt: "reveal", selfCorrect: true, as: "self" });
      const reveal = snapshot.reveal!;
      return { screen, snapshot, question: snapshot.question!, reveal, result: reveal.results[DEMO_SELF.id]! };
    }
    case "player-result-miss": {
      const found = findSelfOutcome(players, query.variant === "none" ? "none" : "miss", n, query.q !== undefined);
      const snapshot = demoSnapshot({
        players,
        playedQuestions: found.n,
        stopAt: "reveal",
        salt: found.salt,
        as: "self",
      });
      const reveal = snapshot.reveal!;
      return { screen, snapshot, question: snapshot.question!, reveal, result: reveal.results[DEMO_SELF.id]! };
    }
    case "player-final": {
      const { engine } = simulateGame({ players, playedQuestions: TOTAL, stopAt: "finished" });
      const id = query.as === "winner" ? (engine.state.leaderboard[0]?.playerId ?? DEMO_SELF.id) : DEMO_SELF.id;
      return { screen, summary: engine.summaryFor(id)!, quizTitle: OS_BATTLE.title };
    }
    case "host-lobby": {
      const snapshot = demoSnapshot({ players, playedQuestions: 0, stopAt: "lobby" });
      const latest = snapshot.players.at(-1);
      return { screen, snapshot, recentJoins: latest ? [latest.id] : [] };
    }
    case "host-intro": {
      const snapshot = demoSnapshot({ players, playedQuestions: n - 1, stopAt: "intro" });
      return { screen, snapshot, upcoming: snapshot.upcoming! };
    }
    case "host-question": {
      const snapshot = demoSnapshot({
        players,
        playedQuestions: n - 1,
        stopAt: "question",
        answeredInOpenQuestion: 27,
      });
      return { screen, snapshot, question: snapshot.question!, authorityNow: authorityNow(snapshot, query.t) };
    }
    case "host-reveal": {
      const snapshot = demoSnapshot({ players, playedQuestions: n, stopAt: "reveal" });
      return { screen, snapshot, question: snapshot.question!, reveal: snapshot.reveal! };
    }
    case "host-leaderboard": {
      return { screen, snapshot: demoSnapshot({ players, playedQuestions: n, stopAt: "leaderboard" }) };
    }
    case "host-podium": {
      return { screen, snapshot: demoSnapshot({ players, playedQuestions: TOTAL, stopAt: "finished" }) };
    }
  }
}
