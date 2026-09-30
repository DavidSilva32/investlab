"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardSummary } from "@/app/_components/dashboard-summary";
import { AppContentSkeleton } from "@/components/app-page-skeleton";
import { Button } from "@/components/ui/button";

type Overview = Parameters<typeof DashboardSummary>[0] & {
  positions: NonNullable<Parameters<typeof DashboardSummary>[0]["positions"]>;
};

type UnassignedSummary =
  | {
      status: "loaded";
      knownValue: number;
      positionCount: number;
      unvaluedPositionCount: number;
    }
  | { status: "unavailable" };

const loadErrorMessage = "Não foi possível carregar o dashboard.";

export function DashboardClient() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [unassignedSummary, setUnassignedSummary] =
    useState<UnassignedSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUnassignedSummary = useCallback(() => {
    fetch("/api/portfolio/objectives")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message);
        return body;
      })
      .then((data) => {
        if (
          typeof data.unassignedKnownValue !== "number" ||
          !Number.isFinite(data.unassignedKnownValue) ||
          !Number.isInteger(data.unassignedPositionCount) ||
          !Number.isInteger(data.unassignedUnvaluedPositionCount)
        ) {
          throw new Error("Invalid objectives summary");
        }
        setUnassignedSummary({
          status: "loaded",
          knownValue: data.unassignedKnownValue,
          positionCount: data.unassignedPositionCount,
          unvaluedPositionCount: data.unassignedUnvaluedPositionCount,
        });
      })
      .catch(() => setUnassignedSummary({ status: "unavailable" }));
  }, []);

  const loadOverview = useCallback(() => {
    fetch("/api/portfolio")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message);
        return body;
      })
      .then(({ positions, emergencyReserve }) => {
        setOverview({
          positions,
          emergencyReserve,
        });
        setError(null);
        loadUnassignedSummary();
      })
      .catch(() => {
        setError(loadErrorMessage);
      });
  }, [loadUnassignedSummary]);

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
          variant="link"
          className="h-auto p-0 text-foreground"
          onClick={loadOverview}
        >
          Tentar novamente
        </Button>
      </div>
    );
  if (!overview)
    return <AppContentSkeleton title="Dashboard" variant="dashboard" />;
  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>{error}</p>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-foreground"
            onClick={loadOverview}
          >
            Tentar novamente
          </Button>
        </div>
      )}
      <DashboardSummary
        {...overview}
        unassignedSummary={unassignedSummary}
        onRetryUnassigned={loadUnassignedSummary}
      />
    </div>
  );
}
