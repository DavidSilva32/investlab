import type {
  PortfolioInsightPosition,
  PortfolioInsights,
} from "@/lib/portfolio-insights";
import type { PortfolioPosition } from "@/app/(private)/portfolio/_components/portfolio-overview";
import { DashboardDestinationsOverview } from "@/app/(private)/_components/dashboard-destinations-overview";
import type { DashboardDestinationSummary } from "@/app/(private)/_components/dashboard-destinations-overview";
import type { DashboardDestinationPosition } from "@/app/(private)/_components/dashboard-destinations-overview";
import { DashboardObservations } from "@/app/(private)/_components/dashboard-observations";
import { DashboardQuickActions } from "@/app/(private)/_components/dashboard-quick-actions";
import { DashboardReviewPositions } from "@/app/(private)/_components/dashboard-review-positions";
import { DashboardWealthSummary } from "@/app/(private)/_components/dashboard-wealth-summary";
import { EmergencyReserveSummary } from "@/app/(private)/_components/emergency-reserve-summary";
import type { EmergencyReserveCalculation } from "@/lib/emergency-reserve";

export function DashboardSummary({
  positions,
  manualPositions = [],
  insights,
  emergencyReserve,
  destinationSummary,
  destinationPositions,
  longTermMissingPositionCount = 0,
  configuredObjectivesCount = 0,
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
  supportReadOnly = false,
  supportChecking = false,
  supportCheckError = false,
}: {
  positions: PortfolioInsightPosition[];
  manualPositions?: PortfolioPosition[];
  insights: PortfolioInsights;
  emergencyReserve?: EmergencyReserveCalculation;
  destinationSummary?: DashboardDestinationSummary | null;
  destinationPositions?: DashboardDestinationPosition[];
  longTermMissingPositionCount?: number;
  configuredObjectivesCount?: number;
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
  supportReadOnly?: boolean;
  supportChecking?: boolean;
  supportCheckError?: boolean;
}) {
  const firstAccess = positions.length === 0;
  const readOnly = supportReadOnly || supportChecking || supportCheckError;

  const quickActions = (
    <DashboardQuickActions
      positions={manualPositions}
      objectivesOpen={objectivesOpen}
      onObjectivesOpenChange={onObjectivesOpenChange}
      objectivesNavigation={objectivesNavigation}
      onObjectivesNavigationChange={onObjectivesNavigationChange}
      importOpen={importOpen}
      onImportOpenChange={onImportOpenChange}
      firstAccess={firstAccess}
      supportReadOnly={supportReadOnly}
      supportChecking={supportChecking}
      supportCheckError={supportCheckError}
    />
  );

  const showDestinations =
    !firstAccess ||
    configuredObjectivesCount > 0 ||
    destinationsUnavailable ||
    destinationsLoading;
  const showEmergencyReserve = firstAccess
    ? Boolean(
        emergencyReserve &&
        (emergencyReserve.monthlyExpenses !== null ||
          emergencyReserve.targetMonths !== null ||
          emergencyReserve.selectedGroups > 0 ||
          emergencyReserve.unvaluedGroups > 0 ||
          (emergencyReserve.missingSelectionCount ?? 0) > 0),
      )
    : true;

  if (firstAccess)
    return (
      <div className="space-y-4">
        {quickActions}
        {(showDestinations || showEmergencyReserve) && (
          <div className="grid items-stretch gap-4 xl:grid-cols-2">
            {showDestinations && (
              <DashboardDestinationsOverview
                summary={destinationSummary}
                positions={destinationPositions}
                longTermMissingPositionCount={longTermMissingPositionCount}
                loading={destinationsLoading}
                unavailable={destinationsUnavailable}
                onRetry={onRetryDestinations}
                onOpenObjectives={() => onObjectivesOpenChange(true)}
                readOnly={readOnly}
              />
            )}
            {showEmergencyReserve && (
              <section aria-labelledby="dashboard-reserve-title">
                <EmergencyReserveSummary
                  calculation={emergencyReserve}
                  onOpenReserve={onOpenReserve}
                  readOnly={readOnly}
                />
              </section>
            )}
          </div>
        )}
      </div>
    );

  return (
    <div className="space-y-4">
      <DashboardWealthSummary positions={positions} insights={insights} />
      {quickActions}

      <div className="grid items-stretch gap-4 xl:grid-cols-2">
        <DashboardDestinationsOverview
          summary={destinationSummary}
          positions={destinationPositions}
          longTermMissingPositionCount={longTermMissingPositionCount}
          loading={destinationsLoading}
          unavailable={destinationsUnavailable}
          onRetry={onRetryDestinations}
          onOpenObjectives={() => onObjectivesOpenChange(true)}
          readOnly={readOnly}
        />
        <section aria-labelledby="dashboard-reserve-title">
          <EmergencyReserveSummary
            calculation={emergencyReserve}
            onOpenReserve={onOpenReserve}
            readOnly={readOnly}
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
