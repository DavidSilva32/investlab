import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { PlanningSimulator } from "./_components/planning-simulator";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Planejamento | InvestLab",
};

export default async function PlanningPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<{ objective?: string }>;
} = {}) {
  const { objective } = await searchParams;
  return (
    <AppShell title="Planejamento">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">
            Planeje seu próximo objetivo
          </h2>
          <p className="text-sm text-muted-foreground">
            Explore como saldo, prazo e aportes podem evoluir.
          </p>
        </div>
        <PlanningSimulator initialObjectiveId={objective ?? null} />
      </div>
    </AppShell>
  );
}
