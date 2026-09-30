import { AppShell } from "@/components/app-shell";
import { ScreenerDashboard } from "../_components/screener-dashboard";

export default function ScreenerPage() {
  return (
    <AppShell title="Explorar">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">
          Ajuste filtros financeiros e explore o universo de empresas da base.
        </p>
      </div>
      <ScreenerDashboard />
    </AppShell>
  );
}
