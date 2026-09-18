"use client";

import { useEffect, useState } from "react";
import { DashboardSummary } from "@/app/_components/dashboard-summary";
import { AppPageSkeleton } from "@/components/app-page-skeleton";

type Overview = Parameters<typeof DashboardSummary>[0] & {
  positions: NonNullable<Parameters<typeof DashboardSummary>[0]["positions"]>;
};

export function DashboardClient() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/portfolio")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message);
        return body;
      })
      .then(({ positions, referenceRates }) =>
        setOverview({ positions, referenceRates }),
      )
      .catch(() => setError("Não foi possível carregar o dashboard."));
  }, []);
  if (error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  if (!overview)
    return <AppPageSkeleton title="Dashboard" variant="dashboard" />;
  return <DashboardSummary {...overview} />;
}
