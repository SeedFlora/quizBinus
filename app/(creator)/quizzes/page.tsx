import type { Metadata } from "next";
import { QuizLibrary } from "@/components/creator/library/QuizLibrary";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("creator.nav.quizzes") };
}

export default function QuizzesPage() {
  return <QuizLibrary />;
}
