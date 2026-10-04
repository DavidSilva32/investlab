import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type {
  PortfolioInsightPosition,
  PortfolioInsights,
} from "@/lib/portfolio-insights";
import { EmergencyReserveSummary } from "@/app/_components/emergency-reserve-summary";
import type { EmergencyReserveCalculation } from "@/lib/emergency-reserve";
import { ContributionAssistant } from "@/app/_components/contribution-assistant";
import {
  DashboardNextAction,
  getDashboardNextAction,
} from "@/app/_components/dashboard-next-action";
import { DashboardObservations } from "@/app/_components/dashboard-observations";
import { DashboardUnassignedSummary } from "@/app/_components/dashboard-unassigned-summary";
import type { UnassignedPortfolioSummary } from "@/app/_components/dashboard-unassigned-summary";
import { DashboardWealthSummary } from "@/app/_components/dashboard-wealth-summary";

export function DashboardSummary({
  positions,
  insights,
  emergencyReserve,
  unassignedSummary,
  onRetryUnassigned,
  contributionAllocationMode,
}: {
  positions: PortfolioInsightPosition[];
  insights: PortfolioInsights;
  emergencyReserve?: EmergencyReserveCalculation;
  unassignedSummary?: UnassignedPortfolioSummary | null;
  onRetryUnassigned?: () => void;
  contributionAllocationMode?: "legacy" | "strategy" | "unavailable";
}) {
  const reserveIncomplete = Boolean(
    emergencyReserve &&
    (emergencyReserve.unvaluedGroups > 0 ||
      (emergencyReserve.missingSelectionCount ?? 0) > 0),
  );
  const nextAction = getDashboardNextAction({
    positionCount: positions.length,
    missingValueCount: insights.unvaluedPositions,
    reserveIncomplete,
    reserve: emergencyReserve,
  });
  const hasUnassignedSummary =
    unassignedSummary !== null && unassignedSummary !== undefined;
  const hasLowerSummaryContent = hasUnassignedSummary || nextAction !== null;

  return (
    <div className="space-y-4">
      <DashboardWealthSummary positions={positions} insights={insights} />

      <section aria-labelledby="dashboard-reserve-title">
        <EmergencyReserveSummary calculation={emergencyReserve} />
      </section>

      <ContributionAssistant
        allocationMode={contributionAllocationMode ?? "legacy"}
      />

      {hasLowerSummaryContent && (
        <div
          className={`grid gap-3 [&>section]:h-full [&>section>div]:h-full ${hasUnassignedSummary && nextAction ? "xl:grid-cols-2" : "grid-cols-1"}`}
        >
          <DashboardUnassignedSummary
            summary={unassignedSummary}
            onRetry={onRetryUnassigned}
          />
          <DashboardNextAction action={nextAction} />
        </div>
      )}

      <DashboardObservations
        positions={positions}
        insights={insights}
        emergencyReserve={emergencyReserve}
      />

      <Collapsible className="text-sm text-muted-foreground">
        <CollapsibleTrigger className="group flex w-fit cursor-pointer items-center gap-2 rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Como ler estes dados
          <ChevronDown
            aria-hidden="true"
            className="size-4 transition-transform group-data-[state=open]:rotate-180"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 max-w-3xl space-y-2 rounded-lg border p-4">
          <p>
            O patrimônio soma os valores conhecidos das posições. Ativos sem
            valor atual não entram na soma; a data mostrada é a data-base
            registrada para as posições.
          </p>
          <p>
            A participação da maior posição e as datas de vencimento são fatos
            da carteira conhecida. Não determinam, por si só, risco, adequação
            ou uma decisão de investimento.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
