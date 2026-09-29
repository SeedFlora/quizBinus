/**
 * Bots and a "virtual host" for demo sessions. Bots are ordinary engine players
 * whose answers come from the deterministic simulator, so demo numbers behave like
 * a real class (clusters of misconceptions, a few slow answers, the odd no-show).
 */

import { simulatedAnswer } from "@/lib/demo/simulate";
import { DEMO_PLAYERS } from "@/lib/seed/players";
import type { GameAuthority } from "../authority";
import { randomToken } from "../ids";

export interface BotConfig {
  count: number;
  /** ms between bot joins in the lobby (randomized ±50%). */
  joinEvery?: number;
  /** Nicknames to avoid (the human player). */
  exclude?: string[];
}

export class BotDriver {
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private joined = 0;
  private answeredFor = new Set<string>();
  private readonly pool;

  constructor(
    private readonly authority: GameAuthority,
    private readonly config: BotConfig,
  ) {
    const exclude = new Set((config.exclude ?? []).map((n) => n.toLowerCase()));
    this.pool = DEMO_PLAYERS.filter((p) => !exclude.has(p.nickname.toLowerCase())).slice(0, config.count);
    // Count bots that already exist (restored session).
    this.joined = this.pool.filter((p) => authority.engine.state.players[p.id]).length;
    for (const p of this.pool) {
      if (authority.engine.state.players[p.id]) authority.registerToken(p.id, randomToken());
    }
  }

  /** Call after every snapshot/state change. */
  sync() {
    const s = this.authority.engine.state;
    if (s.phase === "lobby") this.scheduleJoins();
    if (s.phase === "question") this.scheduleAnswers();
  }

  get allJoined() {
    return this.joined >= this.pool.length;
  }

  dispose() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
  }

  private later(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private joining = false;
  private scheduleJoins() {
    if (this.joining || this.allJoined) return;
    this.joining = true;
    const step = () => {
      if (this.authority.engine.state.phase !== "lobby" || this.allJoined) {
        this.joining = false;
        return;
      }
      const bot = this.pool[this.joined]!;
      this.joined += 1;
      this.authority.addBot(bot);
      const base = this.config.joinEvery ?? 900;
      this.later(base * (0.5 + Math.random()), step);
    };
    this.later(400, step);
  }

  private scheduleAnswers() {
    const q = this.authority.engine.currentQuestion;
    const s = this.authority.engine.state;
    if (!q || this.answeredFor.has(q.id) || s.questionOpenedAt === null) return;
    this.answeredFor.add(q.id);
    const openedAt = s.questionOpenedAt;
    for (const bot of this.pool) {
      if (!s.players[bot.id] || s.players[bot.id]!.kicked) continue;
      const sim = simulatedAnswer(q, bot.id, `live:${s.sessionId}`);
      if (!sim) continue;
      const due = Math.max(250, openedAt + sim.responseMs - Date.now());
      this.later(due, () => {
        if (this.authority.engine.state.phase !== "question") return;
        if (this.authority.engine.state.paused) return;
        this.authority.submitAsBot(bot.id, q.id, sim.payload);
      });
    }
  }
}

/** Drives phases automatically for solo demo play (no lecturer present). */
export class VirtualHost {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastKey = "";

  constructor(
    private readonly authority: GameAuthority,
    private readonly bots: BotDriver | null,
    private readonly timing = { lobbyMin: 5000, intro: 3200, reveal: 5200, leaderboard: 4600 },
  ) {}

  sync() {
    const s = this.authority.engine.state;
    const key = `${s.phase}:${s.questionIndex}`;
    if (key === this.lastKey && s.phase !== "lobby") return;
    this.lastKey = key;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;

    switch (s.phase) {
      case "lobby": {
        const humans = this.authority.engine.activePlayers().filter((p) => !p.id.startsWith("demo-"));
        if (humans.length === 0) return;
        this.timer = setTimeout(
          () => {
            if (this.authority.engine.state.phase === "lobby") this.authority.start();
          },
          this.bots && !this.bots.allJoined ? this.timing.lobbyMin + 2500 : this.timing.lobbyMin,
        );
        return;
      }
      case "intro":
        this.timer = setTimeout(() => this.authority.publishQuestion(), this.timing.intro);
        return;
      case "reveal":
        this.timer = setTimeout(() => this.authority.publishLeaderboard(), this.timing.reveal);
        return;
      case "leaderboard":
        this.timer = setTimeout(() => this.authority.next(), this.timing.leaderboard);
        return;
      default:
        return;
    }
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
  }
}
