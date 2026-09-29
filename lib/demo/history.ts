import type { GameEngine } from "@/lib/game/engine";
import type { Quiz } from "@/lib/game/types";
import { DEMO_PLAYERS } from "@/lib/seed/players";
import { AI_QUIZ, ALGO_QUIZ, CLOUD_QUIZ, NETWORK_QUIZ, OS_BATTLE } from "@/lib/seed/quizzes";
import { simulateGame } from "./simulate";

/**
 * Demo history: a believable fortnight of simulated classes, so the session list,
 * the dashboard and analytics are worth exploring before the first real session.
 * Lives in lib (not in the creator components) because analytics must rebuild
 * exactly the engines behind the rows the history list shows.
 */

export const DEMO_HISTORY_PREFIX = "demo-h-";

interface DemoHistorySpec {
  id: string;
  quiz: Quiz;
  players: number;
  /** Campus days before today, and the WIB start time of that class. */
  daysAgo: number;
  at: string;
  roomCode: string;
}

// BINUS class slots start at 07.20, 09.20, 11.20, 13.20, 15.20; students join a few minutes in.
const DEMO_HISTORY: DemoHistorySpec[] = [
  { id: `${DEMO_HISTORY_PREFIX}os-w5`, quiz: OS_BATTLE, players: 42, daysAgo: 7, at: "13:26", roomCode: "731604" },
  { id: `${DEMO_HISTORY_PREFIX}ai-w5`, quiz: AI_QUIZ, players: 31, daysAgo: 5, at: "15:24", roomCode: "508217" },
  { id: `${DEMO_HISTORY_PREFIX}net-w5`, quiz: NETWORK_QUIZ, players: 38, daysAgo: 6, at: "09:27", roomCode: "264930" },
  { id: `${DEMO_HISTORY_PREFIX}cloud-w5`, quiz: CLOUD_QUIZ, players: 35, daysAgo: 4, at: "07:31", roomCode: "915342" },
  { id: `${DEMO_HISTORY_PREFIX}algo-w4`, quiz: ALGO_QUIZ, players: 40, daysAgo: 10, at: "11:25", roomCode: "447081" },
  { id: `${DEMO_HISTORY_PREFIX}os-w4`, quiz: OS_BATTLE, players: 39, daysAgo: 14, at: "13:24", roomCode: "682155" },
];

/** WIB has no daylight saving; same arithmetic as the creator's campus clock (components/creator/format.ts). */
const CAMPUS_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const campusDayStart = (now: number) => Math.floor((now + CAMPUS_OFFSET_MS) / DAY_MS) * DAY_MS - CAMPUS_OFFSET_MS;

const simulated = new Map<string, GameEngine>();

/**
 * The finished engine behind a demo history session. Deterministic, so analytics
 * can rebuild exactly the numbers the history list shows.
 */
export function simulateDemoHistorySession(sessionId: string): GameEngine | null {
  const spec = DEMO_HISTORY.find((s) => s.id === sessionId);
  if (!spec) return null;
  const cached = simulated.get(spec.id);
  if (cached) return cached;
  const { engine } = simulateGame({
    quiz: spec.quiz,
    players: DEMO_PLAYERS.slice(0, spec.players),
    playedQuestions: spec.quiz.questions.length,
    stopAt: "finished",
    salt: spec.id,
    sessionId: spec.id,
    roomCode: spec.roomCode,
  });
  simulated.set(spec.id, engine);
  return engine;
}

export interface DemoHistoryEntry {
  id: string;
  engine: GameEngine;
  /** Dated relative to `now`, so the history always reads as recent. */
  startedAt: number;
  endedAt: number;
}

/** Every demo class with its engine and its dates relative to today. */
export function demoHistoryEntries(now: number): DemoHistoryEntry[] {
  const today = campusDayStart(now);
  return DEMO_HISTORY.map((spec) => {
    const engine = simulateDemoHistorySession(spec.id)!;
    const [h, m] = spec.at.split(":").map(Number) as [number, number];
    const startedAt = today - spec.daysAgo * DAY_MS + (h * 60 + m) * 60_000;
    const durationMs = spec.quiz.questions.reduce((sum, q) => sum + q.timeLimit * 1000 + 14_000, 90_000);
    return { id: spec.id, engine, startedAt, endedAt: startedAt + durationMs };
  });
}
