import type { Metadata } from "next";
import { z } from "zod";
import { AnalyticsScreen } from "@/components/analytics/AnalyticsScreen";
import { getSeedQuiz } from "@/lib/seed/quizzes";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("analytics.title") };
}

/** Session ids are UUIDs, local random ids, "demo" or "demo-h-…": short and URL-safe. */
const SessionParam = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);

export default async function AnalyticsPage({ params, searchParams }: PageProps<"/quizzes/[id]/analytics">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const session = SessionParam.safeParse(query.session);
  return (
    <AnalyticsScreen
      quizId={id}
      sessionId={session.success ? session.data : null}
      // Seed quizzes are known on the server, so the header does not jump once data arrives.
      initialTitle={getSeedQuiz(id)?.title}
    />
  );
}
