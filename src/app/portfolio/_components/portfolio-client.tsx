"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, List, Target } from "lucide-react";
import { toast } from "sonner";
import {
  usePortfolioAllocation,
  usePortfolioOverview,
} from "@/lib/queries/portfolio";
import { AppContentSkeleton } from "@/components/app-page-skeleton";
import { Button } from "@/components/ui/button";
import { ReferenceRates } from "@/components/reference-rates";
import { PortfolioObjectives } from "@/app/portfolio/_components/portfolio-objectives";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { PortfolioAllocation } from "@/app/portfolio/_components/portfolio-allocation";
import type { ContributionGuidance } from "@/lib/next-contribution-guidance";
import type { PortfolioInsights } from "@/lib/portfolio-insights";
import type { PortfolioConcentration } from "@/lib/portfolio-concentration";
import { MovementDetails, PositionDetails } from "./portfolio-details";
import {
  PortfolioOverview,
  type ClassifiedPosition,
  type PortfolioPosition,
} from "./portfolio-overview";
import type { PortfolioView } from "./portfolio-navigation";

type Overview = {
  positions: PortfolioPosition[];
  insights: PortfolioInsights;
  movements: Parameters<typeof MovementDetails>[0]["movements"];
  referenceRates: Parameters<typeof ReferenceRates>[0]["rates"];
  nextContributionGuidance: ContributionGuidance;
};

const loadErrorMessage = "Não foi possível carregar a carteira.";

export function PortfolioClient({
  activeView,
  initialObjectivesOpen = false,
  initialObjectiveId = null,
  initialObjectiveScreen = null,
}: {
  activeView: PortfolioView;
  initialObjectivesOpen?: boolean;
  initialObjectiveId?: string | null;
  initialObjectiveScreen?: string | null;
}) {
  const overviewQuery = usePortfolioOverview<Overview>(loadErrorMessage);
  const allocationQuery = usePortfolioAllocation<{
    classDistribution: PortfolioConcentration;
  }>(activeView === "overview");
  const overview = overviewQuery.data;
  const classification = useMemo(() => {
    if (allocationQuery.isError) return { status: "unavailable" as const };
    if (allocationQuery.data) {
      return {
        status: "loaded" as const,
        classDistribution: allocationQuery.data.classDistribution,
      };
    }
    return { status: "loading" as const };
  }, [allocationQuery.data, allocationQuery.isError]);
  const [objectivesRoute, setObjectivesRoute] = useState({
    open: initialObjectivesOpen,
    objectiveId: initialObjectiveId,
    screen: initialObjectiveScreen,
  });

  useEffect(() => {
    if (overviewQuery.isError && overview) {
      toast.error(overviewQuery.error.message);
    }
  }, [overview, overviewQuery.error, overviewQuery.isError]);

  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setObjectivesRoute({
        open: params.get("panel") === "objectives",
        objectiveId: params.get("objective"),
        screen: params.get("screen"),
      });
    };
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  const writeObjectivesRoute = useCallback(
    (
      open: boolean,
      objectiveId: string | null = null,
      screen: string | null = null,
    ) => {
      const params = new URLSearchParams(window.location.search);
      if (open) params.set("panel", "objectives");
      else params.delete("panel");
      if (open && objectiveId) params.set("objective", objectiveId);
      else params.delete("objective");
      if (open && screen) params.set("screen", screen);
      else params.delete("screen");
      const query = params.toString();
      window.history[open ? "pushState" : "replaceState"](
        null,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
      );
      setObjectivesRoute({ open, objectiveId, screen });
    },
    [],
  );

  if (overviewQuery.isError && !overview)
    return (
      <div role="alert" className="space-y-3 text-sm text-destructive">
        <p>{overviewQuery.error.message}</p>
        <Button
          type="button"
          className="text-foreground underline underline-offset-4"
          onClick={() => void overviewQuery.refetch()}
        >
          Tentar novamente
        </Button>
      </div>
    );
  if (!overview)
    return <AppContentSkeleton title="Carteira" variant="portfolio" />;
  return (
    <>
      {activeView === "overview" ? (
        <div className="space-y-5">
          <PortfolioOverview
            positions={overview.positions}
            insights={overview.insights}
            classDistribution={
              classification.status === "loaded"
                ? classification.classDistribution
                : null
            }
            classificationStatus={classification.status}
            summaryContent={<ReferenceRates rates={overview.referenceRates} />}
          />
          <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
            <Sheet
              open={objectivesRoute.open}
              onOpenChange={(open) =>
                writeObjectivesRoute(
                  open,
                  open ? objectivesRoute.objectiveId : null,
                  open ? objectivesRoute.screen : null,
                )
              }
            >
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="group h-auto min-h-14 justify-between gap-4 rounded-xl border-primary/20 bg-card px-4 py-3 text-left text-primary shadow-sm hover:border-primary/40 hover:bg-accent hover:text-primary"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Target aria-hidden="true" className="size-5 shrink-0" />
                    <span className="font-medium">Objetivos e destinos</span>
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                  />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="flex h-dvh max-h-dvh w-full flex-col overflow-hidden sm:max-w-3xl"
              >
                <SheetHeader className="mb-6 shrink-0 pr-8">
                  <SheetTitle>Objetivos e destinos</SheetTitle>
                  <SheetDescription>
                    Acompanhe como as posições inteiras se distribuem entre a
                    reserva, objetivos pessoais e valores ainda sem destino.
                  </SheetDescription>
                </SheetHeader>
                <div
                  aria-label="Conteúdo dos objetivos e destinos"
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
                  role="region"
                >
                  <PortfolioObjectives
                    navigation={objectivesRoute}
                    onNavigationChange={(objectiveId, screen) =>
                      writeObjectivesRoute(true, objectiveId, screen)
                    }
                  />
                </div>
              </SheetContent>
            </Sheet>
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="group h-auto min-h-14 justify-between gap-4 rounded-xl border-primary/20 bg-card px-4 py-3 text-left text-primary shadow-sm hover:border-primary/40 hover:bg-accent hover:text-primary"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <List aria-hidden="true" className="size-5 shrink-0" />
                    <span className="font-medium">
                      Metas pessoais e detalhes
                    </span>
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                  />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="flex h-dvh max-h-dvh w-full flex-col overflow-hidden p-4 sm:max-w-5xl sm:p-6"
              >
                <SheetHeader className="mb-5 shrink-0 pr-8">
                  <SheetTitle>Metas pessoais e dados detalhados</SheetTitle>
                  <SheetDescription>
                    Metas registradas por você, classificações e análises
                    detalhadas da carteira.
                  </SheetDescription>
                </SheetHeader>
                <div
                  aria-label="Conteúdo de metas pessoais e dados detalhados"
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
                  role="region"
                >
                  <PortfolioAllocation
                    nextContributionGuidance={overview.nextContributionGuidance}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      ) : activeView === "positions" ? (
        <PositionDetails positions={overview.positions} />
      ) : (
        <MovementDetails movements={overview.movements} />
      )}
    </>
  );
}
