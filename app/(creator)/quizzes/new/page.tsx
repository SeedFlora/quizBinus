import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DeskHeader } from "@/components/creator/CreatorShell";
import { AiGenerateForm } from "@/components/creator/editor/AiGenerateForm";
import { NewQuizChooser } from "@/components/creator/editor/NewQuizChooser";
import { getLecturer } from "@/lib/auth/lecturer";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata({ searchParams }: PageProps<"/quizzes/new">): Promise<Metadata> {
  const [t, query] = await Promise.all([getT(), searchParams]);
  return { title: query.mode === "ai" ? t("editor.ai.title") : t("editor.new.title") };
}

export default async function NewQuizPage({ searchParams }: PageProps<"/quizzes/new">) {
  const [t, query, lecturer] = await Promise.all([getT(), searchParams, getLecturer()]);
  const owner = { id: lecturer.id, name: lecturer.fullName };

  if (query.mode === "ai") {
    return (
      <>
        <DeskHeader
          eyebrow={
            <Link
              href="/quizzes/new"
              className="-ml-1 inline-flex min-h-11 items-center gap-1.5 px-1 hover:text-desk-text"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              {t("editor.new.back")}
            </Link>
          }
          title={t("editor.ai.title")}
          subtitle={t("editor.ai.subtitle")}
        />
        <AiGenerateForm owner={owner} />
      </>
    );
  }

  return (
    <>
      <DeskHeader eyebrow={t("editor.new.eyebrow")} title={t("editor.new.title")} subtitle={t("editor.new.subtitle")} />
      <NewQuizChooser owner={owner} />
    </>
  );
}
