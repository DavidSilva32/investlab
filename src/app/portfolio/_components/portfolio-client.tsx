"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppContentSkeleton } from "@/components/app-page-skeleton";
import { Button } from "@/components/ui/button";
import { ReferenceRates } from "@/components/reference-rates";
import { MovementDetails, PositionDetails } from "./portfolio-details";
import {
  PortfolioOverview,
  type PortfolioPosition,
} from "./portfolio-overview";
import type { PortfolioView } from "./portfolio-navigation";

type Overview = {
  positions: PortfolioPosition[];
  movements: Parameters<typeof MovementDetails>[0]["movements"];
  referenceRates: Parameters<typeof ReferenceRates>[0]["rates"];
};

const loadErrorMessage = "Não foi possível carregar a carteira.";

export function PortfolioClient({ activeView }: { activeView: PortfolioView }) {
  const [overview, setOverview] = useState<Overview | null>(null);
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
      })
      .catch(() => {
        setError(loadErrorMessage);
        toast.error(loadErrorMessage);
      });
  }, []);

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
      <div className="my-5">
        <ReferenceRates rates={overview.referenceRates} />
      </div>
      {activeView === "overview" ? (
        <PortfolioOverview positions={overview.positions} />
      ) : activeView === "positions" ? (
        <PositionDetails positions={overview.positions} />
      ) : (
        <MovementDetails movements={overview.movements} />
      )}
    </>
  );
}
