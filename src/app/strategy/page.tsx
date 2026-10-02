import { AppShell } from "@/components/app-shell";
import { PersonalInvestmentStrategy } from "./_components/personal-investment-strategy";

export const dynamic = "force-dynamic";

export default function StrategyPage() {
  return (
    <AppShell title="Estratégia">
      <PersonalInvestmentStrategy />
    </AppShell>
  );
}
