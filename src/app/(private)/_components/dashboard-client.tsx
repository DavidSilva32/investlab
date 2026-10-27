"use client";

import type { DashboardDestinationSummary } from "@/app/(private)/_components/dashboard-destinations-overview";
import type { DashboardDestinationPosition } from "@/app/(private)/_components/dashboard-destinations-overview";
import { DashboardSummary } from "@/app/(private)/_components/dashboard-summary";
import { DashboardLearningEntry } from "@/app/(private)/_components/dashboard-learning-entry";
import { DashboardFinancesCard } from "@/app/(private)/_components/dashboard-finances-card";
import { AppContentSkeleton } from "@/components/app-page-skeleton";
import { useAdminSupportView } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { LoaderCircle } from "lucide-react";
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
      router.replace("/dashboard", { scroll: false });
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
      <div className="space-y-4">
        <DashboardFinancesCard />
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
      </div>
    );
  if (!overview)
    return (
      <div className="space-y-4">
        <DashboardFinancesCard />
        <AppContentSkeleton title="Dashboard" variant="dashboard" />
      </div>
    );
  return (
    <div className="space-y-4">
      <DashboardLearningEntry />
      <DashboardFinancesCard />
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
      {supportView === null && overview.positions.length > 0 && (
        <p
          className="flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Verificando o modo de visualização. As ações de edição ficam
          indisponíveis até a confirmação.
        </p>
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
