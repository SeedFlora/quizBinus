/**
 * Quiz generation contract. Every provider (the deterministic mock today, a real
 * LLM tomorrow) takes the same validated request and must return drafts that pass
 * `GeneratedDraftSchema`, so the editor never has to trust provider output blindly.
 * See lib/ai/README.md for plugging in a real provider.
 */

import { z } from "zod";
import { DIFFICULTIES, type Question } from "@/lib/game/types";
import { LIMITS, QuestionSchema } from "@/lib/quiz/schema";

/** Types a provider can be asked for. "mixed" lets the provider choose per question. */
export const GENERATION_TYPES = ["mixed", "single", "multiple", "true_false", "short_answer"] as const;
export type GenerationType = (typeof GENERATION_TYPES)[number];

export const GENERATION_COUNTS = [5, 10, 15, 20] as const;
export const GENERATION_MAX = 20;

export const GenerationRequestSchema = z.object({
  topic: z.string().trim().min(2).max(120),
  objective: z.string().trim().max(300).default(""),
  difficulty: z.enum(DIFFICULTIES),
  count: z.number().int().min(1).max(GENERATION_MAX),
  language: z.enum(["id", "en"]),
  questionType: z.enum(GENERATION_TYPES),
});
export type GenerationRequest = z.infer<typeof GenerationRequestSchema>;
export type GenerationRequestInput = z.input<typeof GenerationRequestSchema>;

export const GeneratedDraftSchema = z.object({
  title: z.string().trim().min(1).max(LIMITS.title),
  description: z.string().max(LIMITS.description).optional(),
  topic: z.string().max(LIMITS.shortField),
  questions: z.array(QuestionSchema).min(1).max(GENERATION_MAX),
});

export interface GeneratedDraft {
  title: string;
  description?: string;
  topic: string;
  questions: Question[];
}

export interface ProviderInfo {
  /** Stable id, e.g. "mock" or "ai-gateway:openai/gpt-5". */
  id: string;
  /** Human label shown to the lecturer. */
  label: string;
  /** True when no real model is involved; the UI shows the "not connected" notice. */
  isMock: boolean;
}

export interface GenerationResult {
  draft: GeneratedDraft;
  provider: ProviderInfo;
  /** How many questions are scaffolds the lecturer still has to complete. */
  scaffolds: number;
}

export interface QuizGenerationProvider {
  readonly info: ProviderInfo;
  generate(request: GenerationRequest, options?: { signal?: AbortSignal }): Promise<GenerationResult>;
}
