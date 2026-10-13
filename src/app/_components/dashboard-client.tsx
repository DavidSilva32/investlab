"use client";

import type { DashboardDestinationSummary } from "@/app/_components/dashboard-destinations-overview";
import { DashboardSummary } from "@/app/_components/dashboard-summary";
import { AppContentSkeleton } from "@/components/app-page-skeleton";
import { Button } from "@/components/ui/button";
import type { PortfolioPosition } from "@/app/portfolio/_components/portfolio-overview";
import type { PortfolioInsights } from "@/lib/portfolio-insights";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  usePortfolioObjectives,
  usePortfolioOverview,
} from "@/lib/queries/portfolio";

type Overview = {
  positions: PortfolioPosition[];
  insights: PortfolioInsights;
};

export function DashboardClient({
  openImportOnLoad = false,
}: {
  openImportOnLoad?: boolean;
}) {
  const router = useRouter();
  const [objectivesOpen, setObjectivesOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(openImportOnLoad);
  useEffect(() => {
    if (openImportOnLoad) router.replace("/", { scroll: false });
  }, [openImportOnLoad, router]);
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
        manualPositions={overview.positions}
        objectivesOpen={objectivesOpen}
        onObjectivesOpenChange={setObjectivesOpen}
        importOpen={importOpen}
        onImportOpenChange={setImportOpen}
        destinationSummary={objectivesQuery.data?.destinationSummary}
        destinationsLoading={objectivesQuery.isPending}
        destinationsUnavailable={objectivesQuery.isError}
        onRetryDestinations={() => void objectivesQuery.refetch()}
      />
    </div>
  );
}
