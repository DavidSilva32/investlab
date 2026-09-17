export const dynamic = "force-dynamic";

import Link from "next/link";
import { importRepository } from "@/backend/repositories/import.repository";
import { AppShell } from "@/components/app-shell";
import {
  MovementDetails,
  PositionDetails,
} from "./_components/portfolio-details";
import {
  PortfolioNavigation,
  type PortfolioView,
} from "./_components/portfolio-navigation";
import { PortfolioOverview } from "./_components/portfolio-overview";

export default async function PortfolioPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<{ view?: string }>;
} = {}) {
  const { view } = await searchParams;
  const activeView: PortfolioView =
    view === "positions" || view === "movements" ? view : "overview";
  const [positions, movements] = await Promise.all([
    importRepository.listLatestPositions(),
    importRepository.listMovements(),
  ]);

  return (
    <AppShell title="Carteira">
      <div className="mb-7 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Uma leitura objetiva da sua carteira, baseada na última posição B3
          importada.
        </p>
        <Link
          href="/imports"
          className="text-sm font-medium text-primary hover:underline"
        >
          Importar dados
        </Link>
      </div>
      <PortfolioNavigation activeView={activeView} />
      {activeView === "overview" ? (
        <PortfolioOverview positions={positions} />
      ) : activeView === "positions" ? (
        <PositionDetails positions={positions} />
      ) : (
        <MovementDetails movements={movements} />
      )}
    </AppShell>
  );
}
