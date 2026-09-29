/**
 * MockQuizGenerationProvider: a deterministic stand-in for an LLM.
 *
 * Same request → same draft (seeded by the normalised request), so demos, tests and
 * screenshots are stable. It picks verified questions from lib/ai/bank.ts when the
 * topic matches a known course, and fills any remaining slots with honest scaffolds:
 * a templated prompt whose answers are left empty, so the editor's validation asks
 * the lecturer to complete them. It never invents "facts" for unknown topics.
 */

import type { AnswerOption, Difficulty, Question } from "@/lib/game/types";
import { hashString, seededRandom } from "@/lib/random";
import { newAnswer, newQuestion, reindex } from "@/lib/quiz/factory";
import { QUESTION_BANK, type BankItem, type BankTopic, type Bilingual } from "./bank";
import {
  GeneratedDraftSchema,
  type GenerationRequest,
  type GenerationResult,
  type GenerationType,
  type ProviderInfo,
  type QuizGenerationProvider,
} from "./types";

const TIME_BY_LEVEL: Record<Difficulty, number> = { mudah: 20, sedang: 30, sulit: 45 };
const TRUE_FALSE_TIME: Record<Difficulty, number> = { mudah: 15, sedang: 20, sulit: 30 };
const TYPED_TIME: Record<Difficulty, number> = { mudah: 30, sedang: 45, sulit: 60 };
const LEVELS: readonly Difficulty[] = ["mudah", "sedang", "sulit"];

type Lang = GenerationRequest["language"];
const pickLang = (text: Bilingual, lang: Lang) => (lang === "id" ? text[0] : text[1]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s.+-]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/** Best-matching bank topic, or null when nothing in the bank fits the request. */
export function matchTopic(topic: string, objective: string): BankTopic | null {
  const haystack = ` ${`${topic} ${objective}`.toLowerCase()} `;
  let best: { topic: BankTopic; score: number } | null = null;
  for (const entry of QUESTION_BANK) {
    let score = 0;
    for (const keyword of entry.keywords) {
      // Word-boundary match so "os" does not match "kosong".
      const re = new RegExp(
        `(^|[^\\p{L}\\p{N}])${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`,
        "u",
      );
      if (re.test(haystack)) score += keyword.includes(" ") ? 3 : 2;
    }
    if (score > 0 && (!best || score > best.score)) best = { topic: entry, score };
  }
  return best?.topic ?? null;
}

function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function fitsType(item: BankItem, type: GenerationType) {
  return type === "mixed" || item.kind === type;
}

function fromBank(item: BankItem, lang: Lang, difficulty: Difficulty, rand: () => number): Question {
  const base = newQuestion(item.kind, { language: lang, timeLimit: timeFor(item.kind, difficulty) });
  const common = {
    prompt: pickLang(item.prompt, lang),
    explanation: pickLang(item.explanation, lang),
    topic: pickLang(item.subtopic, lang),
  };

  if (item.kind === "true_false") {
    const answers = base.answers.map((a, i) => ({ ...a, isCorrect: i === item.correct }));
    return { ...base, ...common, answers };
  }
  if (item.kind === "short_answer") {
    return { ...base, ...common, acceptedAnswers: [...(item.accepted ?? [])] };
  }

  const correct = new Set(typeof item.correct === "number" ? [item.correct] : (item.correct ?? []));
  const options: AnswerOption[] = (item.options ?? []).map((text, i) =>
    newAnswer(i, pickLang(text, lang), correct.has(i)),
  );
  return { ...base, ...common, answers: reindex(shuffle(options, rand)) };
}

/** Always one of the editor's timer presets (TIME_LIMITS). */
function timeFor(kind: Question["type"], difficulty: Difficulty) {
  if (kind === "true_false") return TRUE_FALSE_TIME[difficulty];
  if (kind === "short_answer") return TYPED_TIME[difficulty];
  return TIME_BY_LEVEL[difficulty];
}

/* ------------------------------------------------------------------ */
/* Scaffolds for topics the bank does not cover                        */
/* ------------------------------------------------------------------ */

type ScaffoldKind = "single" | "multiple" | "true_false" | "short_answer";

const SCAFFOLDS: Record<ScaffoldKind, ReadonlyArray<Bilingual>> = {
  single: [
    ["Manakah pernyataan yang paling tepat tentang {topic}?", "Which statement about {topic} is most accurate?"],
    ["Manakah contoh penerapan {topic} yang paling sesuai?", "Which is the best example of {topic} in practice?"],
    ["Apa kesalahpahaman yang paling umum tentang {topic}?", "What is the most common misconception about {topic}?"],
    [
      "Dalam konteks “{objective}”, konsep mana yang paling relevan?",
      "In the context of “{objective}”, which concept is most relevant?",
    ],
  ],
  multiple: [
    ["Pilih DUA karakteristik utama {topic}.", "Choose the TWO key characteristics of {topic}."],
    ["Pilih DUA kondisi yang tepat untuk menerapkan {topic}.", "Choose the TWO situations where {topic} applies."],
  ],
  true_false: [
    ["Benar atau salah: {topic} … (lengkapi pernyataan)", "True or false: {topic} … (complete the statement)"],
  ],
  short_answer: [["Sebutkan istilah kunci dalam {topic} yang …", "Name the key term in {topic} that …"]],
};

function scaffold(kind: ScaffoldKind, n: number, req: GenerationRequest): Question {
  const templates = SCAFFOLDS[kind].filter((t) => req.objective || !t[0].includes("{objective}"));
  const template = pickLang(templates[n % templates.length]!, req.language);
  const prompt = template.replace("{topic}", req.topic).replace("{objective}", req.objective);
  const question = newQuestion(kind, { language: req.language, timeLimit: timeFor(kind, req.difficulty) });
  // Answers intentionally empty / unmarked: validation flags them for the lecturer.
  return { ...question, prompt, topic: req.topic };
}

/* ------------------------------------------------------------------ */

const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

export class MockQuizGenerationProvider implements QuizGenerationProvider {
  // The UI shows its own localized label for mock providers (editor.ai.mockLabel).
  readonly info: ProviderInfo = { id: "mock", label: "Sample generator", isMock: true };

  constructor(private readonly latencyMs = 700) {}

  async generate(request: GenerationRequest, options?: { signal?: AbortSignal }): Promise<GenerationResult> {
    const seedKey = [
      request.topic,
      request.objective,
      request.difficulty,
      request.count,
      request.language,
      request.questionType,
    ]
      .join("|")
      .toLowerCase()
      .trim();
    const rand = seededRandom(hashString(seedKey));
    const topic = matchTopic(request.topic, request.objective);
    const queryTokens = tokens(`${request.topic} ${request.objective}`);

    const picked: Question[] = [];
    if (topic) {
      const wanted = LEVELS.indexOf(request.difficulty);
      const ranked = shuffle(
        topic.items.filter((item) => fitsType(item, request.questionType)),
        rand,
      )
        .map((item) => {
          const sub = pickLang(item.subtopic, "id").toLowerCase() + " " + pickLang(item.subtopic, "en").toLowerCase();
          const relevance = queryTokens.filter((t) => sub.includes(t)).length;
          const distance = Math.abs(LEVELS.indexOf(item.level) - wanted);
          return { item, score: relevance * 10 - distance };
        })
        .sort((a, b) => b.score - a.score);
      for (const { item } of ranked.slice(0, request.count))
        picked.push(fromBank(item, request.language, request.difficulty, rand));
    }

    const scaffoldKinds: ScaffoldKind[] =
      request.questionType === "mixed" ? ["single", "multiple", "true_false", "short_answer"] : [request.questionType];
    let scaffolds = 0;
    while (picked.length < request.count) {
      const kind = scaffoldKinds[scaffolds % scaffoldKinds.length]!;
      picked.push(scaffold(kind, Math.floor(scaffolds / scaffoldKinds.length), request));
      scaffolds++;
    }

    await delay(this.latencyMs, options?.signal);

    // "Deadlock · Sistem Operasi" when the bank knows the course, else just the topic.
    const title = topic
      ? `${capitalize(request.topic)} · ${pickLang(topic.title, request.language)}`
      : capitalize(request.topic);

    const draft = GeneratedDraftSchema.parse({
      title: title.slice(0, 120),
      description: request.objective || undefined,
      topic: request.topic,
      questions: reindex(picked),
    });

    return { draft, provider: this.info, scaffolds };
  }
}

function capitalize(text: string) {
  const t = text.trim();
  return t.charAt(0).toLocaleUpperCase("id") + t.slice(1);
}
