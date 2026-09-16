import { AppShell } from "@/components/app-shell";
import { PortfolioImport } from "@/components/portfolio-import";
export default function ImportsPage() {
  return (
    <AppShell title="Importações">
      <div className="mb-7">
        <p className="text-sm text-muted-foreground">
          Importe posições ou movimentações da B3 em um único fluxo.
        </p>
      </div>
      <PortfolioImport />
    </AppShell>
  );
}
