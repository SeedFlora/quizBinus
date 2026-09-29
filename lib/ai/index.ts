/**
 * Entry point for quiz generation. Screens call `getQuizGenerationProvider()` and
 * never know which implementation answers. Until a real provider is registered,
 * the deterministic mock is used and the UI shows the "not connected" notice.
 */

import { MockQuizGenerationProvider } from "./mock-provider";
import type { QuizGenerationProvider } from "./types";

let registered: QuizGenerationProvider | null = null;
let mock: MockQuizGenerationProvider | null = null;

/** Install a real provider (see lib/ai/README.md). Call once, e.g. from a client bootstrap module. */
export function registerQuizGenerationProvider(provider: QuizGenerationProvider | null) {
  registered = provider;
}

export function getQuizGenerationProvider(): QuizGenerationProvider {
  if (registered) return registered;
  mock ??= new MockQuizGenerationProvider();
  return mock;
}

export { MockQuizGenerationProvider } from "./mock-provider";
export * from "./types";
