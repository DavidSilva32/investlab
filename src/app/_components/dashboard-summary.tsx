import type {
  PortfolioInsightPosition,
  PortfolioInsights,
} from "@/lib/portfolio-insights";
import type { PortfolioPosition } from "@/app/portfolio/_components/portfolio-overview";
import { DashboardDestinationsOverview } from "@/app/_components/dashboard-destinations-overview";
import type { DashboardDestinationSummary } from "@/app/_components/dashboard-destinations-overview";
import type { DashboardDestinationPosition } from "@/app/_components/dashboard-destinations-overview";
import { DashboardObservations } from "@/app/_components/dashboard-observations";
import { DashboardQuickActions } from "@/app/_components/dashboard-quick-actions";
import { DashboardReviewPositions } from "@/app/_components/dashboard-review-positions";
import { DashboardWealthSummary } from "@/app/_components/dashboard-wealth-summary";
import { EmergencyReserveSummary } from "@/app/_components/emergency-reserve-summary";
import type { EmergencyReserveCalculation } from "@/lib/emergency-reserve";

export function DashboardSummary({
  positions,
  manualPositions = [],
  insights,
  emergencyReserve,
  destinationSummary,
  destinationPositions,
  longTermMissingPositionCount = 0,
  destinationsLoading,
  destinationsUnavailable,
  onRetryDestinations,
  objectivesOpen = false,
  onObjectivesOpenChange = () => {},
  objectivesNavigation,
  onObjectivesNavigationChange,
  onOpenReserve = () => {},
  importOpen = false,
  onImportOpenChange = () => {},
}: {
  positions: PortfolioInsightPosition[];
  manualPositions?: PortfolioPosition[];
  insights: PortfolioInsights;
  emergencyReserve?: EmergencyReserveCalculation;
  destinationSummary?: DashboardDestinationSummary | null;
  destinationPositions?: DashboardDestinationPosition[];
  longTermMissingPositionCount?: number;
  destinationsLoading?: boolean;
  destinationsUnavailable?: boolean;
  onRetryDestinations?: () => void;
  objectivesOpen?: boolean;
  onObjectivesOpenChange?: (open: boolean) => void;
  objectivesNavigation?: {
    open: boolean;
    objectiveId: string | null;
    screen: string | null;
  };
  onObjectivesNavigationChange?: (
    objectiveId: string | null,
    screen?: string | null,
  ) => void;
  onOpenReserve?: () => void;
  importOpen?: boolean;
  onImportOpenChange?: (open: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <DashboardWealthSummary positions={positions} insights={insights} />
      <DashboardQuickActions
        positions={manualPositions}
        objectivesOpen={objectivesOpen}
        onObjectivesOpenChange={onObjectivesOpenChange}
        objectivesNavigation={objectivesNavigation}
        onObjectivesNavigationChange={onObjectivesNavigationChange}
        importOpen={importOpen}
        onImportOpenChange={onImportOpenChange}
      />

      <div className="grid items-stretch gap-4 xl:grid-cols-2">
        <DashboardDestinationsOverview
          summary={destinationSummary}
          positions={destinationPositions}
          longTermMissingPositionCount={longTermMissingPositionCount}
          loading={destinationsLoading}
          unavailable={destinationsUnavailable}
          onRetry={onRetryDestinations}
          onOpenObjectives={() => onObjectivesOpenChange(true)}
        />
        <section aria-labelledby="dashboard-reserve-title">
          <EmergencyReserveSummary
            calculation={emergencyReserve}
            onOpenReserve={onOpenReserve}
          />
        </section>
      </div>

      <DashboardReviewPositions count={insights.unvaluedPositions} />
      <DashboardObservations
        positions={positions}
        insights={insights}
        emergencyReserve={emergencyReserve}
      />
    </div>
  );
}
