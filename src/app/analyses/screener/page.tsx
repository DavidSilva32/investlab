import { AppShell } from "@/components/app-shell";
import { AnalysisExperienceNav } from "../_components/analysis-experience-nav";
import { ScreenerDashboard } from "../_components/screener-dashboard";

export default function ScreenerPage() {
  return (
    <AppShell title="Explorar ações">
      <AnalysisExperienceNav active="explore" />
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">
          Explore empresas brasileiras com fundamentos sincronizados para a base
          local.
        </p>
      </div>
      <ScreenerDashboard />
    </AppShell>
  );
}
