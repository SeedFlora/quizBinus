import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiQuizRepository, QuizApiError } from "@/lib/quiz/api-repository";
import { OS_BATTLE } from "@/lib/seed/quizzes";
import { toListItem } from "@/lib/quiz/repository";

type Call = { url: string; method: string; body?: string };

/** Stubs fetch with one response per call, recording what the repository sent. */
function stubFetch(...responses: Array<{ status: number; body?: unknown } | Error>) {
  const calls: Call[] = [];
  const queue = [...responses];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body as string | undefined });
      const next = queue.shift();
      if (!next) throw new Error(`unexpected fetch ${url}`);
      if (next instanceof Error) throw next;
      return new Response(next.body === undefined ? null : JSON.stringify(next.body), { status: next.status });
    }),
  );
  return calls;
}

const stored = { ...OS_BATTLE, id: "5b7e6f2a-8f0c-4d1e-9a3b-2c4d5e6f7a8b" };

afterEach(() => vi.unstubAllGlobals());

describe("ApiQuizRepository", () => {
  it("lists quizzes, bare or wrapped, and validates each item", async () => {
    const item = toListItem(stored);
    stubFetch({ status: 200, body: [item] }, { status: 200, body: { quizzes: [{ ...item, className: null }] } });
    const repo = new ApiQuizRepository();
    expect(await repo.list()).toEqual([item]);
    // A null optional column is treated as absent, not as a broken response.
    expect((await repo.list())[0]).toMatchObject({ id: stored.id, title: stored.title });
  });

  it("returns null for an unknown quiz and the parsed quiz otherwise", async () => {
    const calls = stubFetch({ status: 404, body: { error: "not_found" } }, { status: 200, body: { quiz: stored } });
    const repo = new ApiQuizRepository();
    expect(await repo.get("missing")).toBeNull();
    expect(await repo.get(stored.id)).toEqual(stored);
    expect(calls.map((c) => c.url)).toEqual(["/api/quizzes/missing", `/api/quizzes/${stored.id}`]);
  });

  it("saves with PUT and falls back to POST when the quiz is not stored yet", async () => {
    const draft = { ...OS_BATTLE, id: "os-battle" };
    const calls = stubFetch({ status: 404, body: { error: "not_found" } }, { status: 201, body: stored });
    const saved = await new ApiQuizRepository().save(draft);
    // The server may store it under a new id; the caller gets that id back.
    expect(saved.id).toBe(stored.id);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["PUT /api/quizzes/os-battle", "POST /api/quizzes"]);
    expect(JSON.parse(calls[1]!.body!)).toMatchObject({ id: "os-battle", title: OS_BATTLE.title });
  });

  it("treats deleting an already-deleted quiz as done", async () => {
    stubFetch({ status: 404 }, { status: 204 });
    const repo = new ApiQuizRepository();
    await expect(repo.remove("gone")).resolves.toBeUndefined();
    await expect(repo.remove(stored.id)).resolves.toBeUndefined();
  });

  it("maps failures to codes the desk can explain", async () => {
    stubFetch(
      { status: 401, body: { error: "unauthorized" } },
      { status: 429, body: { error: "rate_limited" } },
      new TypeError("Failed to fetch"),
      { status: 200, body: { quizzes: "nope" } },
    );
    const repo = new ApiQuizRepository();
    const code = (p: Promise<unknown>) =>
      p.then(
        () => null,
        (e: unknown) => (e instanceof QuizApiError ? e.code : e),
      );
    expect(await code(repo.list())).toBe("unauthorized");
    expect(await code(repo.save(stored))).toBe("rate_limited");
    expect(await code(repo.list())).toBe("network");
    expect(await code(repo.list())).toBe("unavailable");
  });
});
