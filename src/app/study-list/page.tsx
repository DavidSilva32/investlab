import { AppShell } from "@/components/app-shell";
import { StudyListDashboard } from "./_components/study-list-dashboard";

export default function StudyListPage() {
  return (
    <AppShell title="Lista de estudo">
      <StudyListDashboard />
    </AppShell>
  );
}
