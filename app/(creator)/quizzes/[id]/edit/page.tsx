import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { QuizEditor } from "@/components/creator/editor/QuizEditor";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("editor.pageTitle") };
}

/** Quiz ids are uuids or readable seed ids ("os-battle"). */
const QuizIdParam = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
/** Set by the AI flow: how many drafted questions are scaffolds to complete. */
const ScaffoldsParam = z.coerce.number().int().min(0).max(20).catch(0);

export default async function EditQuizPage({ params, searchParams }: PageProps<"/quizzes/[id]/edit">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const quizId = QuizIdParam.safeParse(id);
  if (!quizId.success) notFound();
  // The quiz itself loads in the browser, from localStorage (memory mode) or /api/quizzes (database mode).
  return (
    <QuizEditor
      key={quizId.data}
      quizId={quizId.data}
      fromAi={query.from === "ai"}
      scaffolds={ScaffoldsParam.parse(query.scaffolds)}
    />
  );
}
