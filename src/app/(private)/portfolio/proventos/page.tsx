import { PortfolioProventos } from "@/app/(private)/portfolio/_components/portfolio-proventos";
import { PortfolioNavigation } from "@/app/(private)/portfolio/_components/portfolio-navigation";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default function PortfolioProventosPage() {
  return (
    <AppShell title="Carteira">
      <PortfolioNavigation activeView="proventos" />
      <PortfolioProventos />
    </AppShell>
  );
}
