"use client";

import type { DashboardDestinationSummary } from "@/app/_components/dashboard-destinations-overview";
import { DashboardSummary } from "@/app/_components/dashboard-summary";
import { AppContentSkeleton } from "@/components/app-page-skeleton";
import { Button } from "@/components/ui/button";
import {
  usePortfolioObjectives,
  usePortfolioOverview,
} from "@/lib/queries/portfolio";

type Overview = Parameters<typeof DashboardSummary>[0] & {
  positions: NonNullable<Parameters<typeof DashboardSummary>[0]["positions"]>;
};

export function DashboardClient() {
  const overviewQuery = usePortfolioOverview<Overview>(
    "Não foi possível carregar o dashboard.",
  );
  const objectivesQuery = usePortfolioObjectives<{
    destinationSummary?: DashboardDestinationSummary;
  }>();
  const overview = overviewQuery.data;

  const error =
    overviewQuery.error instanceof Error ? overviewQuery.error.message : null;
  if (overviewQuery.isError && !overview)
    return (
      <div role="alert" className="space-y-3 text-sm text-destructive">
        <p>{error}</p>
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-foreground"
          onClick={() => void overviewQuery.refetch()}
        >
          Tentar novamente
        </Button>
      </div>
    );
  if (!overview)
    return <AppContentSkeleton title="Dashboard" variant="dashboard" />;
  return (
    <div className="space-y-4">
      {overviewQuery.isError && error && (
        <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>{error}</p>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-foreground"
            onClick={() => void overviewQuery.refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      )}
      <DashboardSummary
        {...overview}
        destinationSummary={objectivesQuery.data?.destinationSummary}
        destinationsLoading={objectivesQuery.isPending}
        destinationsUnavailable={objectivesQuery.isError}
        onRetryDestinations={() => void objectivesQuery.refetch()}
      />
    </div>
  );
}
