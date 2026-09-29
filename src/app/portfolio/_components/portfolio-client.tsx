"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppContentSkeleton } from "@/components/app-page-skeleton";
import { Button } from "@/components/ui/button";
import { ReferenceRates } from "@/components/reference-rates";
import { EmergencyReserveEditor } from "@/app/portfolio/_components/emergency-reserve-editor";
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

export function PortfolioClient({ activeView }: { activeView: PortfolioView }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [classification, setClassification] = useState<ClassificationState>({
    status: "loading",
  });
  const [error, setError] = useState<string | null>(null);

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
            <Sheet>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  Configurar reserva
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="bottom-auto top-4 h-auto max-h-[calc(100dvh-2rem)] w-full overflow-y-auto sm:max-w-2xl"
              >
                <SheetHeader className="mb-6 pr-8">
                  <SheetTitle>Configuração da reserva</SheetTitle>
                  <SheetDescription>
                    Ajuste suas despesas, sua meta pessoal e os investimentos
                    que deseja considerar.
                  </SheetDescription>
                </SheetHeader>
                <EmergencyReserveEditor />
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
