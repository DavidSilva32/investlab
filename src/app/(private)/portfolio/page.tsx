export const dynamic = "force-dynamic";

import { AppShell } from "@/components/app-shell";
import { PortfolioClient } from "@/app/(private)/portfolio/_components/portfolio-client";
import {
  PortfolioNavigation,
  type PortfolioView,
} from "@/app/(private)/portfolio/_components/portfolio-navigation";

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    panel?: string;
    objective?: string;
    screen?: string;
  }>;
}) {
  const { view, panel, objective, screen } = await searchParams;
  const activeView: PortfolioView =
    panel === "objectives" || panel === "classification"
      ? "overview"
      : view === "positions" || view === "movements"
        ? view
        : "overview";
  return (
    <AppShell title="Carteira">
      <PortfolioNavigation activeView={activeView} />
      <PortfolioClient
        key={`${activeView}:${panel ?? ""}:${objective ?? ""}:${screen ?? ""}`}
        activeView={activeView}
        initialObjectivesOpen={panel === "objectives"}
        initialClassificationOpen={panel === "classification"}
        initialObjectiveId={objective ?? null}
        initialObjectiveScreen={screen ?? null}
      />
    </AppShell>
  );
}
