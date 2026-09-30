import { AppShell } from "@/components/app-shell";
import { StockAnalysisDashboard } from "./_components/stock-analysis-dashboard";

export default async function AnalysesPage({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string }>;
}) {
  const { ticker } = await searchParams;
  return (
    <AppShell title="Análises">
      <StockAnalysisDashboard
        initialTicker={
          ticker?.match(/^[A-Za-z]{4}[0-9]{1,2}$/)
            ? ticker.toUpperCase()
            : undefined
        }
      />
    </AppShell>
  );
}
