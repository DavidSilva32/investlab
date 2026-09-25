"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DashboardSummary } from "@/app/_components/dashboard-summary";
import { AppContentSkeleton } from "@/components/app-page-skeleton";
import { Button } from "@/components/ui/button";

type Overview = Parameters<typeof DashboardSummary>[0] & {
  positions: NonNullable<Parameters<typeof DashboardSummary>[0]["positions"]>;
};

const loadErrorMessage = "Não foi possível carregar o dashboard.";

export function DashboardClient() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(() => {
    fetch("/api/portfolio")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message);
        return body;
      })
      .then(
        ({
          positions,
          referenceRates,
          emergencyReserve,
          nextContributionGuidance,
        }) => {
          setOverview({
            positions,
            referenceRates,
            emergencyReserve,
            nextContributionGuidance,
          });
          setError(null);
        },
      )
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
  return <DashboardSummary {...overview} />;
}
