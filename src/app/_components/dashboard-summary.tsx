import type {
  PortfolioInsightPosition,
  PortfolioInsights,
} from "@/lib/portfolio-insights";
import { DashboardDestinationsOverview } from "@/app/_components/dashboard-destinations-overview";
import type { DashboardDestinationSummary } from "@/app/_components/dashboard-destinations-overview";
import { DashboardObservations } from "@/app/_components/dashboard-observations";
import { DashboardQuickActions } from "@/app/_components/dashboard-quick-actions";
import { DashboardReviewPositions } from "@/app/_components/dashboard-review-positions";
import { DashboardWealthSummary } from "@/app/_components/dashboard-wealth-summary";
import { EmergencyReserveSummary } from "@/app/_components/emergency-reserve-summary";
import type { EmergencyReserveCalculation } from "@/lib/emergency-reserve";

export function DashboardSummary({
  positions,
  insights,
  emergencyReserve,
  destinationSummary,
  destinationsLoading,
  destinationsUnavailable,
  onRetryDestinations,
}: {
  positions: PortfolioInsightPosition[];
  insights: PortfolioInsights;
  emergencyReserve?: EmergencyReserveCalculation;
  destinationSummary?: DashboardDestinationSummary | null;
  destinationsLoading?: boolean;
  destinationsUnavailable?: boolean;
  onRetryDestinations?: () => void;
}) {
  return (
    <div className="space-y-4">
      <DashboardWealthSummary positions={positions} insights={insights} />
      <DashboardQuickActions />

      <div className="grid items-stretch gap-4 xl:grid-cols-2">
        <DashboardDestinationsOverview
          summary={destinationSummary}
          loading={destinationsLoading}
          unavailable={destinationsUnavailable}
          onRetry={onRetryDestinations}
        />
        <section aria-labelledby="dashboard-reserve-title">
          <EmergencyReserveSummary calculation={emergencyReserve} />
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
