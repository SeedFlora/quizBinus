# Quiz generation (`lib/ai`)

The creator's **Generate dengan AI** flow (`/quizzes/new?mode=ai`) talks to one
interface, `QuizGenerationProvider` (`lib/ai/types.ts`):

```ts
interface QuizGenerationProvider {
  readonly info: { id: string; label: string; isMock: boolean };
  generate(request: GenerationRequest, options?: { signal?: AbortSignal }): Promise<GenerationResult>;
}
```

- `GenerationRequestSchema` validates the lecturer's input (topic, objective,
  difficulty, count 1–20, language, question type incl. `"mixed"`).
- `GeneratedDraftSchema` validates what a provider returns. It reuses
  `QuestionSchema` from `lib/quiz/schema.ts`, so a draft is structurally a real quiz.
- The editor then runs `validateQuiz()`; anything incomplete shows up as
  "N hal perlu diperbaiki" before the quiz can be played.

## Today: the mock

`MockQuizGenerationProvider` makes **no network calls**. It is deterministic
(same request → same draft) and:

1. matches the topic/objective against a small bilingual bank of verified questions
   (`lib/ai/bank.ts`: OS, databases, networks, data structures, algorithms, OOP,
   software engineering, security, web);
2. fills any remaining slots with **scaffolds**: a templated prompt with empty or
   unmarked answers, so validation asks the lecturer to finish them. It never
   invents facts for topics it doesn't know.

The UI always shows "Penyedia AI belum dihubungkan. Draf dibuat oleh generator
contoh." while `provider.info.isMock` is true, plus the review reminder
"Draf dari AI perlu ditinjau dosen sebelum dimainkan."

## Plugging in a real provider

Keep API keys on the server. The recommended shape is a route handler that runs the
model, and a thin client provider that calls it.

### 1. Server: route handler (e.g. Vercel AI SDK through AI Gateway)

```ts
// app/api/ai/generate/route.ts
import { generateObject } from "ai"; // npm i ai
import { z } from "zod";
import { GenerationRequestSchema } from "@/lib/ai/types";

// What the model fills in. Keep it simpler than Question; ids/positions are added after.
const ModelOutput = z.object({
  title: z.string(),
  questions: z.array(
    z.object({
      type: z.enum(["single", "multiple", "true_false", "short_answer"]),
      prompt: z.string().max(300),
      options: z.array(z.object({ text: z.string().max(120), correct: z.boolean() })).max(4),
      acceptedAnswers: z.array(z.string()).max(8).optional(),
      explanation: z.string().max(600),
      topic: z.string().max(160),
    }),
  ),
});

export async function POST(request: Request) {
  // 1. authenticate the lecturer (getLecturerOrNull()) and rate-limit per user
  const parsed = GenerationRequestSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const input = parsed.data;

  const { object } = await generateObject({
    model: "openai/gpt-5-mini", // any AI Gateway model id; auth via AI_GATEWAY_API_KEY / OIDC
    schema: ModelOutput,
    system: "You write university-level quiz questions for BINUS lecturers. Be factually precise.",
    prompt: `Language: ${input.language}. Topic: ${input.topic}. Objective: ${input.objective}.
Difficulty: ${input.difficulty}. Count: ${input.count}. Type: ${input.questionType}.`,
  });

  return Response.json(object);
}
```

### 2. Client: provider that calls the route

```ts
// lib/ai/http-provider.ts
import { newAnswer, newQuestion, reindex } from "@/lib/quiz/factory";
import { GeneratedDraftSchema, type QuizGenerationProvider } from "@/lib/ai/types";

export class HttpQuizGenerationProvider implements QuizGenerationProvider {
  readonly info = { id: "ai-gateway", label: "AI Gateway", isMock: false };

  async generate(request, { signal } = {}) {
    const res = await fetch("/api/ai/generate", { method: "POST", body: JSON.stringify(request), signal });
    if (!res.ok) throw new Error("generation_failed");
    const out = await res.json();
    // Map model output onto real Questions with the factory (fresh ids, defaults)…
    const questions = out.questions.map((q) => ({
      ...newQuestion(q.type, { language: request.language }),
      prompt: q.prompt,
      explanation: q.explanation,
      topic: q.topic,
      answers: reindex(q.options.map((o, i) => newAnswer(i, o.text, o.correct))),
      acceptedAnswers: q.acceptedAnswers,
    }));
    // …and never trust it blindly.
    const draft = GeneratedDraftSchema.parse({ title: out.title, topic: request.topic, questions });
    return { draft, provider: this.info, scaffolds: 0 };
  }
}
```

### 3. Register it

```ts
// e.g. in a client bootstrap imported by the creator layout
import { registerQuizGenerationProvider } from "@/lib/ai";
import { HttpQuizGenerationProvider } from "@/lib/ai/http-provider";

if (process.env.NEXT_PUBLIC_AI_PROVIDER === "gateway") {
  registerQuizGenerationProvider(new HttpQuizGenerationProvider());
}
```

Nothing in the UI changes: `info.isMock === false` hides the "not connected" notice,
and the review reminder stays, because every AI draft must be checked by the
lecturer before students play it.
