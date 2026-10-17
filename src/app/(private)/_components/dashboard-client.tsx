"use client";

import type { DashboardDestinationSummary } from "@/app/(private)/_components/dashboard-destinations-overview";
import type { DashboardDestinationPosition } from "@/app/(private)/_components/dashboard-destinations-overview";
import { DashboardSummary } from "@/app/(private)/_components/dashboard-summary";
import { ADMIN_SUPPORT_VIEW_RETRY_EVENT } from "@/components/admin-support-view-banner";
import { AppContentSkeleton } from "@/components/app-page-skeleton";
import { useAdminSupportView } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import type { PortfolioPosition } from "@/app/(private)/portfolio/_components/portfolio-overview";
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
  const supportView = useAdminSupportView();
  const [objectivesNavigation, setObjectivesNavigation] = useState({
    open: false,
    objectiveId: null as string | null,
    screen: null as string | null,
  });
  const [importOpen, setImportOpen] = useState(false);
  const [deepLinkDismissed, setDeepLinkDismissed] = useState(false);
  useEffect(() => {
    if (openImportOnLoad && supportView === false)
      router.replace("/", { scroll: false });
  }, [openImportOnLoad, router, supportView]);
  const effectiveImportOpen =
    supportView === false &&
    (importOpen || (openImportOnLoad && !deepLinkDismissed));
  const overviewQuery = usePortfolioOverview<Overview>(
    "Não foi possível carregar o dashboard.",
  );
  const objectivesQuery = usePortfolioObjectives<{
    destinationSummary?: DashboardDestinationSummary;
    positions?: DashboardDestinationPosition[];
    objectives?: Array<{
      purpose?: string | null;
      missingPositionCount?: number;
    }>;
  }>();
  const overview = overviewQuery.data;

  const error =
    overviewQuery.error instanceof Error ? overviewQuery.error.message : null;
  const supportCheckError = supportView === "error";
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
      {supportCheckError && overview.positions.length > 0 && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <p className="text-muted-foreground">
            Não foi possível confirmar o estado de suporte. As ações permanecem
            bloqueadas até uma nova tentativa.
          </p>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-foreground"
            onClick={() =>
              window.dispatchEvent(new Event(ADMIN_SUPPORT_VIEW_RETRY_EVENT))
            }
          >
            Tentar novamente
          </Button>
        </div>
      )}
      <DashboardSummary
        {...overview}
        manualPositions={overview.positions}
        objectivesOpen={objectivesNavigation.open}
        objectivesNavigation={objectivesNavigation}
        onObjectivesOpenChange={(open) =>
          setObjectivesNavigation({
            open,
            objectiveId: null,
            screen: null,
          })
        }
        onObjectivesNavigationChange={(objectiveId, screen) =>
          setObjectivesNavigation((current) => ({
            ...current,
            objectiveId,
            screen: screen ?? null,
          }))
        }
        onOpenReserve={() =>
          setObjectivesNavigation({
            open: true,
            objectiveId: "reserve",
            screen: null,
          })
        }
        importOpen={effectiveImportOpen}
        onImportOpenChange={(open) => {
          if (!open && openImportOnLoad) setDeepLinkDismissed(true);
          setImportOpen(open);
        }}
        supportReadOnly={supportView === true}
        supportChecking={supportView === null}
        supportCheckError={supportCheckError}
        onRetrySupportCheck={() =>
          window.dispatchEvent(new Event(ADMIN_SUPPORT_VIEW_RETRY_EVENT))
        }
        destinationSummary={objectivesQuery.data?.destinationSummary}
        destinationPositions={objectivesQuery.data?.positions}
        longTermMissingPositionCount={
          objectivesQuery.data?.objectives
            ?.filter(
              (objective) => objective.purpose === "LONG_TERM_INVESTMENT",
            )
            .reduce(
              (total, objective) =>
                total + (objective.missingPositionCount ?? 0),
              0,
            ) ?? 0
        }
        configuredObjectivesCount={
          objectivesQuery.data?.objectives?.length ?? 0
        }
        destinationsLoading={objectivesQuery.isPending}
        destinationsUnavailable={objectivesQuery.isError}
        onRetryDestinations={() => void objectivesQuery.refetch()}
      />
    </div>
  );
}
