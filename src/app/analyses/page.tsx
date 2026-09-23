import { AppShell } from "@/components/app-shell";
import { StockAnalysisDashboard } from "./_components/stock-analysis-dashboard";

export default async function AnalysesPage({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string }>;
}) {
  const { ticker = "PETR4" } = await searchParams;
  const initialTicker = ticker.toUpperCase();
  return (
    <AppShell title="Análises">
      <div className="mb-7">
        <p className="text-sm text-muted-foreground">
          Consulte indicadores e dados de mercado para apoiar as análises da sua
          carteira.
        </p>
      </div>
      <StockAnalysisDashboard initialTicker={initialTicker} />
    </AppShell>
  );
}
