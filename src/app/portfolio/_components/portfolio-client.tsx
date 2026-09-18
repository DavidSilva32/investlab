"use client";

import { useEffect, useState } from "react";
import { AppPageSkeleton } from "@/components/app-page-skeleton";
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

export function PortfolioClient({ activeView }: { activeView: PortfolioView }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/portfolio")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message);
        return body;
      })
      .then(setOverview)
      .catch(() => setError("Não foi possível carregar a carteira."));
  }, []);
  if (error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  if (!overview)
    return <AppPageSkeleton title="Carteira" variant="portfolio" />;
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
