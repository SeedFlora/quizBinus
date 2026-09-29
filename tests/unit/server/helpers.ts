/**
 * Shared plumbing for the game-server tests. The runtime and the rate limiter are
 * process-wide singletons (globalThis), so every test starts from a clean slate.
 */

import { getGameRuntime } from "@/lib/server/game-runtime";
import { resetRateLimits } from "@/lib/security/rate-limit";
import type { HostIdentity } from "@/lib/server/host-auth";
import { DEMO_LECTURER } from "@/lib/seed/quizzes";
import { question, quiz } from "../../fixtures/quiz";

export const ORIGIN = "http://localhost:3100";

/** Drops every live session (timers, bots, streams) and forgets rate-limit hits. */
export function resetServer() {
  const runtime = getGameRuntime();
  for (const [id] of runtime.list()) runtime.drop(id);
  resetRateLimits();
}

/** Memory-mode host identity: the demo lecturer, optionally holding a host key. */
export function memoryHost(hostKeyHash: string | null = null): HostIdentity {
  return {
    id: DEMO_LECTURER.id,
    displayName: `${DEMO_LECTURER.salutation} ${DEMO_LECTURER.fullName}`,
    mode: "memory",
    hostKeyHash,
  };
}

export function dbHost(id = "11111111-1111-4111-8111-111111111111"): HostIdentity {
  return { id, displayName: "Pak Budi", mode: "database", hostKeyHash: null };
}

/** A playable two-question quiz with a stable id. */
export function testQuiz() {
  return {
    ...quiz([question("single", { id: "q1", timeLimit: 20 }), question("single", { id: "q2", timeLimit: 20 })]),
    id: "quiz-srv",
  };
}

/** A same-origin JSON request as one of our pages would send it. */
export function jsonRequest(
  url: string,
  body: unknown,
  init: { headers?: Record<string, string>; signal?: AbortSignal } = {},
): Request {
  return new Request(`${ORIGIN}${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, host: "localhost:3100", ...init.headers },
    body: JSON.stringify(body),
    signal: init.signal,
  });
}

/** Route handler context for a dynamic segment. */
export function ctx<P extends Record<string, string>>(params: P) {
  return { params: Promise.resolve(params) };
}

const sleep = (ms: number) => new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));

/**
 * Incremental reader for a text/event-stream response. Keeps one pending read across
 * calls, so waiting with a timeout never loses a chunk.
 */
export class SseReader {
  readonly frames: string[] = [];
  done = false;
  private reader: ReadableStreamDefaultReader<string>;
  private pending: Promise<ReadableStreamReadResult<string>> | null = null;
  private buffer = "";

  constructor(res: Response) {
    this.reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  }

  /** Reads until `until(frames)` holds, the stream ends, or `timeoutMs` passes. */
  async until(until: (frames: string[]) => boolean, timeoutMs = 2000): Promise<string[]> {
    const deadline = Date.now() + timeoutMs;
    while (!until(this.frames) && !this.done && Date.now() < deadline) {
      this.pending ??= this.reader.read();
      const next = await Promise.race([this.pending, sleep(20)]);
      if (next === null) continue;
      this.pending = null;
      if (next.done) {
        this.done = true;
        break;
      }
      this.buffer += next.value;
      let sep: number;
      while ((sep = this.buffer.indexOf("\n\n")) !== -1) {
        this.frames.push(this.buffer.slice(0, sep));
        this.buffer = this.buffer.slice(sep + 2);
      }
    }
    return this.frames;
  }

  /** Data frames parsed as JSON (heartbeat comments skipped). */
  events(): Array<Record<string, unknown> & { type: string }> {
    return this.frames.filter((f) => f.startsWith("data: ")).map((f) => JSON.parse(f.slice(6)));
  }

  cancel() {
    return this.reader.cancel().catch(() => undefined);
  }
}
