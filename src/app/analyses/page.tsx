import { AppShell } from "@/components/app-shell";
import { StockAnalysisProof } from "./_components/stock-analysis-proof";
export default function AnalysesPage() {
  return (
    <AppShell title="Análises">
      <div className="mb-7">
        <p className="text-sm text-muted-foreground">
          Consulte indicadores e dados de mercado para apoiar as análises da sua
          carteira.
        </p>
      </div>
      <StockAnalysisProof />
    </AppShell>
  );
}
