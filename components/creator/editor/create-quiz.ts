import { getQuizRepository } from "@/components/creator/data";
import type { CreatorStorage } from "@/components/creator/storage-context";
import type { Question, Quiz } from "@/lib/game/types";
import { newQuiz } from "@/lib/quiz/factory";

export interface QuizOwner {
  id: string;
  /** Pre-fills the course's lecturer field. */
  name: string;
}

/**
 * Create, persist and return a new quiz; the caller navigates to its editor. Use
 * the returned id: the database may store the quiz under a new one.
 */
export async function createQuiz(
  storage: CreatorStorage,
  owner: QuizOwner,
  seed: {
    title?: string;
    description?: string;
    topic?: string;
    difficulty?: Quiz["difficulty"];
    language?: Quiz["language"];
    questions?: Question[];
  } = {},
): Promise<Quiz> {
  const quiz = newQuiz({ ownerId: owner.id, course: { lecturer: owner.name }, ...seed });
  return getQuizRepository(storage).save(quiz);
}
