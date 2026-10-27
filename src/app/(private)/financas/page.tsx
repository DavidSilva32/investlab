import { AppShell } from "@/components/app-shell";
import { FinancialOverview } from "@/app/(private)/financas/_components/financial-overview";

export const dynamic = "force-dynamic";

export default function FinancesPage() {
  return (
    <AppShell title="Finanças">
      <FinancialOverview />
    </AppShell>
  );
}
