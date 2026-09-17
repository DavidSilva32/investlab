export const dynamic = "force-dynamic";

import Link from "next/link";
import { importRepository } from "@/backend/repositories/import.repository";
import { DashboardSummary } from "@/app/_components/dashboard-summary";
import { AppShell } from "@/components/app-shell";

export default async function HomePage() {
  const positions = await importRepository.listLatestPositions();

  return (
    <AppShell title="Dashboard">
      <div className="mb-7 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm text-muted-foreground">
          O essencial da sua carteira, com base na última posição B3 importada.
        </p>
        <Link
          href="/imports"
          className="text-sm font-medium text-primary hover:underline"
        >
          Importar dados
        </Link>
      </div>
      <DashboardSummary positions={positions} />
    </AppShell>
  );
}
