import { describe, expect, it } from "vitest";
import {
  GenerationRequestSchema,
  getQuizGenerationProvider,
  MockQuizGenerationProvider,
  registerQuizGenerationProvider,
  type GenerationRequestInput,
  type QuizGenerationProvider,
} from "@/lib/ai";
import { matchTopic } from "@/lib/ai/mock-provider";
import { validateQuestion } from "@/lib/quiz/schema";

const provider = new MockQuizGenerationProvider(0);
const request = (input: Partial<GenerationRequestInput> = {}) =>
  GenerationRequestSchema.parse({
    topic: "Deadlock",
    objective: "",
    difficulty: "sedang",
    count: 5,
    language: "id",
    questionType: "mixed",
    ...input,
  });

/** Content without the random ids, for determinism checks. */
const content = (qs: Awaited<ReturnType<typeof provider.generate>>["draft"]["questions"]) =>
  qs.map((q) => ({
    type: q.type,
    prompt: q.prompt,
    answers: q.answers.map((a) => [a.text, a.isCorrect]),
    accepted: q.acceptedAnswers,
  }));

describe("GenerationRequestSchema", () => {
  it("needs a real topic and a sane count", () => {
    expect(GenerationRequestSchema.safeParse({ ...request(), topic: " a " }).success).toBe(false);
    expect(GenerationRequestSchema.safeParse({ ...request(), count: 50 }).success).toBe(false);
    expect(GenerationRequestSchema.safeParse({ ...request(), questionType: "numeric" }).success).toBe(false);
  });
});

describe("matchTopic", () => {
  it("matches course keywords on word boundaries only", () => {
    expect(matchTopic("Deadlock", "")?.key).toBe("os");
    expect(matchTopic("Normalisasi basis data", "")?.key).toBe("db");
    // "os" must not match inside "kosong"
    expect(matchTopic("Ruang kosong", "")).toBeNull();
  });
});

describe("MockQuizGenerationProvider", () => {
  it("identifies itself as a mock so the UI shows the 'not connected' notice", () => {
    expect(provider.info.isMock).toBe(true);
  });

  it("is deterministic: same request, same draft (ids aside)", async () => {
    const a = await provider.generate(request());
    const b = await provider.generate(request());
    expect(content(a.draft.questions)).toEqual(content(b.draft.questions));
  });

  it("a known topic yields complete, playable questions from the verified bank", async () => {
    const { draft, scaffolds } = await provider.generate(request({ count: 5 }));
    expect(scaffolds).toBe(0);
    expect(draft.questions).toHaveLength(5);
    expect(draft.title).toContain("Sistem Operasi");
    for (const q of draft.questions) expect(validateQuestion(q), q.prompt).toEqual([]);
    expect(draft.questions.map((q) => q.position)).toEqual([0, 1, 2, 3, 4]);
  });

  it("an unknown topic yields honest scaffolds that validation flags, never invented facts", async () => {
    const { draft, scaffolds } = await provider.generate(request({ topic: "Etika profesi arsitek", count: 4 }));
    expect(scaffolds).toBe(4);
    for (const q of draft.questions) {
      expect(q.prompt).toContain("Etika profesi arsitek");
      expect(validateQuestion(q).length).toBeGreaterThan(0);
      expect(q.answers.some((a) => a.isCorrect)).toBe(false);
    }
  });

  it("respects the requested question type and language", async () => {
    const { draft } = await provider.generate(request({ questionType: "true_false", language: "en", count: 3 }));
    for (const q of draft.questions) {
      expect(q.type).toBe("true_false");
      expect(q.answers.map((a) => a.text)).toEqual(["True", "False"]);
    }
  });

  it("uses only the editor's timer presets", async () => {
    const { draft } = await provider.generate(request({ count: 10, difficulty: "sulit" }));
    for (const q of draft.questions) expect([5, 10, 15, 20, 30, 45, 60, 90, 120]).toContain(q.timeLimit);
  });

  it("can be cancelled", async () => {
    const slow = new MockQuizGenerationProvider(5_000);
    const controller = new AbortController();
    const pending = slow.generate(request(), { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toBeDefined();
  });
});

describe("getQuizGenerationProvider", () => {
  it("falls back to the mock and lets a real provider be registered", () => {
    expect(getQuizGenerationProvider().info.isMock).toBe(true);
    const real: QuizGenerationProvider = {
      info: { id: "test", label: "Test", isMock: false },
      generate: () => Promise.reject(new Error("unused")),
    };
    registerQuizGenerationProvider(real);
    try {
      expect(getQuizGenerationProvider()).toBe(real);
    } finally {
      registerQuizGenerationProvider(null);
    }
    expect(getQuizGenerationProvider().info.isMock).toBe(true);
  });
});
