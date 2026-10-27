import { AppShell } from "@/components/app-shell";
import { RecurringExpensesClient } from "@/app/(private)/despesas-recorrentes/_components/recurring-expenses-client";

export const dynamic = "force-dynamic";

export default function RecurringExpensesPage() {
  return (
    <AppShell title="Despesas">
      <RecurringExpensesClient />
    </AppShell>
  );
}
