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
import { DashboardContributionOverview } from "@/app/_components/dashboard-contribution-overview";
import {
  DashboardDestinationsOverview,
  type DashboardDestinationSummary,
} from "@/app/_components/dashboard-destinations-overview";
import type { ContributionGuidance } from "@/lib/next-contribution-guidance";
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
  unassignedLoading,
  onRetryUnassigned,
  nextContributionGuidance,
  contributionAllocationMode,
  destinationSummary,
  destinationsUnavailable,
}: {
  positions: PortfolioInsightPosition[];
  insights: PortfolioInsights;
  emergencyReserve?: EmergencyReserveCalculation;
  unassignedSummary?: UnassignedPortfolioSummary | null;
  unassignedLoading?: boolean;
  onRetryUnassigned?: () => void;
  contributionAllocationMode?: "legacy" | "strategy" | "unavailable";
  nextContributionGuidance?: ContributionGuidance;
  destinationSummary?: DashboardDestinationSummary | null;
  destinationsUnavailable?: boolean;
}) {
  const reserveIncomplete = Boolean(
    emergencyReserve &&
    (emergencyReserve.unvaluedGroups > 0 ||
      (emergencyReserve.missingSelectionCount ?? 0) > 0),
  );
  const candidateAction = getDashboardNextAction({
    positionCount: positions.length,
    missingValueCount: insights.unvaluedPositions,
    reserveIncomplete,
    reserve: emergencyReserve,
  });
  const nextAction =
    nextContributionGuidance?.status === "reserve_below_target" ||
    nextContributionGuidance?.status === "reserve_incomplete"
      ? null
      : candidateAction;
  const hasUnassignedSummary =
    !destinationSummary &&
    !destinationsUnavailable &&
    unassignedSummary !== null &&
    unassignedSummary !== undefined;
  const hasLowerSummaryContent = hasUnassignedSummary || nextAction !== null;

  return (
    <div className="space-y-4">
      <DashboardWealthSummary positions={positions} insights={insights} />

      <div className="grid items-stretch gap-4 xl:grid-cols-2">
        <DashboardContributionOverview guidance={nextContributionGuidance} />
        <DashboardDestinationsOverview
          summary={destinationSummary}
          loading={unassignedLoading}
          unavailable={destinationsUnavailable}
          onRetry={onRetryUnassigned}
        />
      </div>

      {contributionAllocationMode === "legacy" && (
        <Collapsible
          id="legacy-contribution"
          className="scroll-mt-20 rounded-lg border p-3"
        >
          <CollapsibleTrigger className="group inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-sm text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Simular com metas anteriores
            <ChevronDown
              aria-hidden="true"
              className="size-4 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <ContributionAssistant allocationMode="legacy" />
          </CollapsibleContent>
        </Collapsible>
      )}

      <section aria-labelledby="dashboard-reserve-title">
        <EmergencyReserveSummary calculation={emergencyReserve} />
      </section>

      {hasLowerSummaryContent && (
        <div
          className={`grid gap-3 [&>section]:h-full [&>section>div]:h-full ${hasUnassignedSummary && nextAction ? "xl:grid-cols-2" : "grid-cols-1"}`}
        >
          {hasUnassignedSummary && (
            <DashboardUnassignedSummary
              summary={unassignedSummary}
              onRetry={onRetryUnassigned}
            />
          )}
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
