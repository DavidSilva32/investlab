export const dynamic = "force-dynamic";

import { DashboardClient } from "@/app/_components/dashboard-client";
import { AppShell } from "@/components/app-shell";

export default function HomePage() {
  return (
    <AppShell title="Dashboard">
      <div className="mb-7">
        <p className="text-sm text-muted-foreground">
          Patrimônio importado, concentração e caminhos para acompanhar sua
          carteira.
        </p>
      </div>
      <DashboardClient />
    </AppShell>
  );
}
