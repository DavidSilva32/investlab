"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
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
import { MovementDetails, PositionDetails } from "./portfolio-details";
import {
  PortfolioOverview,
  type ClassifiedPosition,
  type PortfolioPosition,
} from "./portfolio-overview";
import type { PortfolioView } from "./portfolio-navigation";

type Overview = {
  positions: PortfolioPosition[];
  movements: Parameters<typeof MovementDetails>[0]["movements"];
  referenceRates: Parameters<typeof ReferenceRates>[0]["rates"];
  nextContributionGuidance: ContributionGuidance;
};

type ClassificationState =
  | { status: "loading" }
  | { status: "loaded"; positions: ClassifiedPosition[] }
  | { status: "unavailable" };

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
  const [overview, setOverview] = useState<Overview | null>(null);
  const [objectivesRoute, setObjectivesRoute] = useState({
    open: initialObjectivesOpen,
    objectiveId: initialObjectiveId,
    screen: initialObjectiveScreen,
  });
  const [classification, setClassification] = useState<ClassificationState>({
    status: "loading",
  });
  const [error, setError] = useState<string | null>(null);

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

  const loadOverview = useCallback(() => {
    fetch("/api/portfolio")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message);
        return body;
      })
      .then((data) => {
        setOverview(data);
        setError(null);
        if (activeView === "overview") {
          setClassification({ status: "loading" });
          fetch("/api/portfolio/allocation")
            .then(async (response) => {
              if (!response.ok) throw new Error("allocation unavailable");
              return response.json();
            })
            .then((allocation) => {
              setClassification({
                status: "loaded",
                positions: allocation.positions ?? [],
              });
            })
            .catch(() => setClassification({ status: "unavailable" }));
        }
      })
      .catch(() => {
        setError(loadErrorMessage);
        toast.error(loadErrorMessage);
      });
  }, [activeView]);

  useEffect(() => {
    loadOverview();
    window.addEventListener("portfolio:updated", loadOverview);
    return () => window.removeEventListener("portfolio:updated", loadOverview);
  }, [loadOverview]);

  if (error && !overview)
    return (
      <div role="alert" className="space-y-3 text-sm text-destructive">
        <p>{error}</p>
        <Button
          type="button"
          className="text-foreground underline underline-offset-4"
          onClick={loadOverview}
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
            classifiedPositions={
              classification.status === "loaded"
                ? classification.positions
                : null
            }
            classificationStatus={classification.status}
            summaryContent={<ReferenceRates rates={overview.referenceRates} />}
          />
          <div className="flex flex-wrap gap-2 border-t pt-4">
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
                <Button type="button" size="sm">
                  Objetivos e destinos
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="flex h-dvh max-h-dvh w-full flex-col overflow-hidden sm:max-w-5xl"
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
                <Button type="button" variant="outline" size="sm">
                  Metas pessoais e detalhes
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-full overflow-y-auto sm:max-w-5xl"
              >
                <SheetHeader className="mb-6 pr-8">
                  <SheetTitle>Metas pessoais e dados detalhados</SheetTitle>
                  <SheetDescription>
                    Metas registradas por você, classificações e análises
                    detalhadas da carteira.
                  </SheetDescription>
                </SheetHeader>
                <PortfolioAllocation
                  nextContributionGuidance={overview.nextContributionGuidance}
                />
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
