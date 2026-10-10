"use client";

import { useMemo } from "react";
import type { DashboardDestinationSummary } from "@/app/_components/dashboard-destinations-overview";
import { DashboardSummary } from "@/app/_components/dashboard-summary";
import type { UnassignedPortfolioSummary } from "@/app/_components/dashboard-unassigned-summary";
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
    unassignedKnownValue: number;
    unassignedPositionCount: number;
    unassignedUnvaluedPositionCount: number;
  }>();
  const overview = overviewQuery.data;
  const unassignedSummary = useMemo<UnassignedPortfolioSummary | null>(() => {
    const data = objectivesQuery.data;
    if (objectivesQuery.isError) return { status: "unavailable" };
    if (!data) return null;
    if (
      typeof data.unassignedKnownValue !== "number" ||
      !Number.isFinite(data.unassignedKnownValue) ||
      !Number.isInteger(data.unassignedPositionCount) ||
      !Number.isInteger(data.unassignedUnvaluedPositionCount)
    ) {
      return { status: "unavailable" };
    }
    return {
      status: "loaded",
      knownValue: data.unassignedKnownValue,
      positionCount: data.unassignedPositionCount,
      unvaluedPositionCount: data.unassignedUnvaluedPositionCount,
    };
  }, [objectivesQuery.data, objectivesQuery.isError]);

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
        destinationsUnavailable={objectivesQuery.isError}
        unassignedSummary={unassignedSummary}
        unassignedLoading={objectivesQuery.isPending}
        onRetryUnassigned={() => void objectivesQuery.refetch()}
      />
    </div>
  );
}
