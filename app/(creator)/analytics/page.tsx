import { redirect } from "next/navigation";
import { getLecturer } from "@/lib/auth/lecturer";
import { listQuizzes } from "@/lib/db/quizzes";
import { listHostSessions } from "@/lib/db/reports";
import { isDatabaseConfigured } from "@/lib/env.server";
import { OS_BATTLE } from "@/lib/seed/quizzes";

const reportPath = (quizId: string, sessionId?: string) =>
  `/quizzes/${encodeURIComponent(quizId)}/analytics${sessionId ? `?session=${encodeURIComponent(sessionId)}` : ""}`;

/**
 * "Analitik" in the rail. Database mode: the report of the lecturer's latest class
 * that actually started, else of their newest arena (a simulated class until it is
 * played). Memory mode keeps its history in the browser: the sample arena's report.
 */
export default async function AnalyticsIndexPage() {
  if (!isDatabaseConfigured()) redirect(reportPath(OS_BATTLE.id));
  const lecturer = await getLecturer();
  const [sessions, quizzes] = await Promise.all([
    listHostSessions(lecturer.id).catch(() => []),
    listQuizzes(lecturer.id).catch(() => []),
  ]);
  const latest = sessions.find((s) => s.quizId && s.startedAt);
  redirect(latest?.quizId ? reportPath(latest.quizId, latest.id) : reportPath(quizzes[0]?.id ?? OS_BATTLE.id));
}
