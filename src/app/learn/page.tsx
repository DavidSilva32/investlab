import { AppShell } from "@/components/app-shell";
import { resolveLearningClassId } from "@/lib/asset-class-learning";
import { LearningLibrary } from "./_components/learning-library";

export default async function LearnPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { class: requestedClass } = await searchParams;
  const selectedClass = resolveLearningClassId(
    requestedClass,
    requestedClass === undefined ? "fiis" : null,
  );

  return (
    <AppShell title="Aprender">
      <LearningLibrary selectedClass={selectedClass} />
    </AppShell>
  );
}
