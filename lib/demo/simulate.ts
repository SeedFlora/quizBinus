/**
 * Deterministic game simulation used by demo mode, screen fixtures and tests.
 * It drives the REAL GameEngine with simulated students, so every number on a
 * demo screen (scores, ranks, distributions, streaks) is internally consistent.
 */

import { GameEngine } from "@/lib/game/engine";
import type { AnswerPayload, GamePhase, PublicPlayer, Question, Quiz, SessionSnapshot } from "@/lib/game/types";
import { correctAnswerIds } from "@/lib/game/evaluate";
import { hashString, seededRandom } from "@/lib/random";
import { OS_BATTLE, DEMO_LECTURER } from "@/lib/seed/quizzes";
import { DEMO_PLAYERS, DEMO_SELF } from "@/lib/seed/players";

export const DEMO_SESSION_ID = "demo";
export const DEMO_ROOM_CODE = "482913";
export const DEMO_EPOCH = Date.UTC(2026, 8, 28, 2, 0, 0);

/** Per-student skill so the same students tend to lead (and one makes a comeback). */
function skillOf(playerId: string): number {
  const base = seededRandom(hashString(`skill:${playerId}`))();
  return 0.45 + base * 0.5;
}

export function simulatedAnswer(
  question: Question,
  playerId: string,
  salt: string,
): { payload: AnswerPayload; responseMs: number } | null {
  const rand = seededRandom(hashString(`${salt}:${question.id}:${playerId}`));
  if (rand() < 0.04) return null; // occasionally someone doesn't answer
  const skill = skillOf(playerId);
  const correct = rand() < skill;
  const limit = question.timeLimit * 1000;
  const responseMs = Math.round(limit * (0.12 + rand() * (correct ? 0.5 : 0.75)));
  const ids = question.answers.map((a) => a.id);
  const right = correctAnswerIds(question);

  switch (question.type) {
    case "multiple": {
      const pick = correct ? right : [ids[Math.floor(rand() * ids.length)]!];
      return { payload: { kind: "choice", answerIds: pick }, responseMs };
    }
    case "ordering": {
      const order = correct ? right : [...right].reverse();
      return { payload: { kind: "order", answerIds: order }, responseMs };
    }
    case "numeric":
      return {
        payload: {
          kind: "number",
          value: correct ? (question.numeric?.value ?? 0) : (question.numeric?.value ?? 0) + 1,
        },
        responseMs,
      };
    case "short_answer":
      return {
        payload: { kind: "text", value: correct ? (question.acceptedAnswers?.[0] ?? "") : "tidak tahu" },
        responseMs,
      };
    case "poll":
      return { payload: { kind: "choice", answerIds: [ids[Math.floor(rand() * ids.length)]!] }, responseMs };
    default: {
      if (correct && right[0]) return { payload: { kind: "choice", answerIds: [right[0]] }, responseMs };
      // Wrong answers cluster on one plausible distractor, which gives a visible misconception.
      const wrong = ids.filter((id) => !right.includes(id));
      const bias = rand() < 0.6 ? 0 : Math.floor(rand() * wrong.length);
      return { payload: { kind: "choice", answerIds: [wrong[bias] ?? ids[0]!] }, responseMs };
    }
  }
}

/** A fully correct answer in the payload shape the question type expects. */
function correctPayload(question: Question): AnswerPayload {
  const right = correctAnswerIds(question);
  switch (question.type) {
    case "ordering":
      return { kind: "order", answerIds: right };
    case "numeric":
      return { kind: "number", value: question.numeric?.value ?? 0 };
    case "short_answer":
      return { kind: "text", value: question.acceptedAnswers?.[0] ?? "" };
    case "multiple":
      return { kind: "choice", answerIds: right };
    default:
      // polls have no right answer; any option is a valid vote
      return { kind: "choice", answerIds: [right[0] ?? question.answers[0]?.id ?? ""] };
  }
}

export interface SimulationOptions {
  quiz?: Quiz;
  players?: PublicPlayer[];
  /** Number of questions fully played (scored) before stopping. */
  playedQuestions: number;
  /** Where to stop after playing. */
  stopAt: GamePhase;
  /** For stopAt "question": how many players have already answered the open question. */
  answeredInOpenQuestion?: number;
  /** Let DEMO_SELF answer the last played question correctly (for the "Benar!" screen). */
  selfCorrect?: boolean;
  salt?: string;
  sessionId?: string;
  roomCode?: string;
}

export function simulateGame(options: SimulationOptions): { engine: GameEngine; now: number } {
  const quiz = options.quiz ?? OS_BATTLE;
  const players = options.players ?? DEMO_PLAYERS;
  const salt = options.salt ?? "nusa";
  let now = DEMO_EPOCH;

  const engine = GameEngine.create({
    sessionId: options.sessionId ?? DEMO_SESSION_ID,
    roomCode: options.roomCode ?? DEMO_ROOM_CODE,
    hostName: `${DEMO_LECTURER.salutation} ${DEMO_LECTURER.fullName}`,
    quiz,
    now,
  });

  players.forEach((p, i) => {
    now += 900 + ((i * 37) % 500);
    engine.addPlayer({ id: p.id, nickname: p.nickname, avatarSeed: p.avatarSeed }, now);
  });
  if (options.stopAt === "lobby") return { engine, now };

  now += 4000;
  engine.start(now);

  const playOne = (question: Question, isLast: boolean, limit?: number) => {
    const opened = now;
    engine.openQuestion(opened);
    const answers = players
      .map((p) => {
        let sim = simulatedAnswer(question, p.id, salt);
        if (isLast && options.selfCorrect && p.id === DEMO_SELF.id) {
          sim = { payload: correctPayload(question), responseMs: 2800 };
        }
        return sim ? { p, sim } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.sim.responseMs - b.sim.responseMs);
    const take = typeof limit === "number" ? answers.slice(0, limit) : answers;
    for (const { p, sim } of take) engine.submitAnswer(p.id, question.id, sim.payload, opened + sim.responseMs);
    return opened;
  };

  for (let i = 0; i < options.playedQuestions; i++) {
    const q = engine.currentQuestion!;
    const opened = playOne(q, i === options.playedQuestions - 1);
    now = opened + q.timeLimit * 1000 + 200;
    engine.closeQuestion(now);
    const lastPlayed = i === options.playedQuestions - 1;
    if (lastPlayed && (options.stopAt === "reveal" || options.stopAt === "leaderboard")) {
      if (options.stopAt === "leaderboard") engine.showLeaderboardPhase();
      return { engine, now };
    }
    now += 6000;
    engine.next(now);
    if (engine.state.phase === "finished") return { engine, now };
  }

  if (options.stopAt === "intro") return { engine, now };
  if (options.stopAt === "question") {
    const q = engine.currentQuestion!;
    const opened = now;
    playOne(q, false, options.answeredInOpenQuestion ?? 0);
    // Freeze the clock a few seconds into the question.
    now = opened + 7000;
    return { engine, now };
  }
  if (options.stopAt === "finished") {
    engine.finish(now);
    return { engine, now };
  }
  return { engine, now };
}

/** Convenience: a snapshot as a given player (or host) would see it. */
export function demoSnapshot(options: SimulationOptions & { as?: "host" | "self" }): SessionSnapshot {
  const { engine, now } = simulateGame(options);
  return engine.snapshotFor(now, options.as === "self" ? DEMO_SELF.id : undefined);
}
