import { AppShell } from "@/components/app-shell";
import { AnalysisExperienceNav } from "@/app/analyses/_components/analysis-experience-nav";
import { StudyListDashboard } from "./_components/study-list-dashboard";

export default function StudyListPage() {
  return (
    <AppShell title="Lista de estudo">
      <AnalysisExperienceNav active="study-list" />
      <StudyListDashboard />
    </AppShell>
  );
}
