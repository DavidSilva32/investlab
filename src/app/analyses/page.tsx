import { AppShell } from "@/components/app-shell";
import { AnalysisExperienceNav } from "./_components/analysis-experience-nav";
import { DiscoverDashboard } from "./_components/discover-dashboard";
import { StockAnalysisDashboard } from "./_components/stock-analysis-dashboard";

export default async function AnalysesPage({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string }>;
}) {
  const { ticker } = await searchParams;
  const isIndividualAnalysis = Boolean(ticker);
  return (
    <AppShell title={isIndividualAnalysis ? "Analisar" : "Descobrir"}>
      <AnalysisExperienceNav
        active={isIndividualAnalysis ? "analysis" : "discover"}
      />
      {isIndividualAnalysis ? (
        <StockAnalysisDashboard initialTicker={ticker!.toUpperCase()} />
      ) : (
        <DiscoverDashboard />
      )}
    </AppShell>
  );
}
