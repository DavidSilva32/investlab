"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PortfolioObjectiveProjection } from "@/app/(private)/portfolio/_components/portfolio-objective-projection";
import type { ObjectivePosition } from "@/app/(private)/portfolio/_components/portfolio-objective-assignment";
import type { PortfolioObjective } from "@/app/(private)/portfolio/_components/portfolio-objective-card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type {
  PortfolioInsightPosition,
  PortfolioInsights,
} from "@/lib/portfolio-insights";
import {
  resolveObjectiveProjectionBalance,
  resolvePortfolioProjectionBalance,
} from "@/lib/portfolio-projection-balance";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

type PlanningData = {
  objectives: PortfolioObjective[];
  positions: ObjectivePosition[];
  destinationSummary: {
    knownTotal: number;
    missingPositionCount: number;
    unvaluedPositionCount: number;
  };
};

type PortfolioOverviewData = {
  insights: PortfolioInsights;
  positions: PortfolioInsightPosition[];
};

const portfolioOption = "portfolio";
const loadErrorMessage = "Não foi possível carregar os dados do planejamento.";

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : loadErrorMessage;
}

export function PlanningSimulator({
  initialObjectiveId,
}: {
  initialObjectiveId: string | null;
}) {
  const [selection, setSelection] = useState(
    initialObjectiveId ?? portfolioOption,
  );
  const needsPortfolioOverview = selection === portfolioOption;
  const objectivesQuery = useQuery({
    queryKey: queryKeys.portfolio.objectives(),
    queryFn: () =>
      apiRequest<PlanningData>(
        "/api/portfolio/objectives",
        undefined,
        loadErrorMessage,
      ),
  });
  const portfolioQuery = useQuery({
    queryKey: queryKeys.portfolio.overview(),
    enabled: needsPortfolioOverview,
    queryFn: () =>
      apiRequest<PortfolioOverviewData>(
        "/api/portfolio",
        undefined,
        loadErrorMessage,
      ),
  });
  const data = objectivesQuery.data;
  const portfolio = portfolioQuery.data;
  const availableObjectives = (data?.objectives ?? []).filter(
    (objective) =>
      objective.kind !== "RESERVE" && objective.id !== reserveObjectiveId,
  );
  const selectedObjective =
    selection === portfolioOption
      ? null
      : (availableObjectives.find((objective) => objective.id === selection) ??
        null);
  const objectiveUnavailable =
    selection !== portfolioOption &&
    data !== undefined &&
    selectedObjective === null;
  const selectedObjectiveLoading =
    selection !== portfolioOption &&
    data === undefined &&
    objectivesQuery.isPending;
  const objectivesLoadFailed =
    objectivesQuery.isError ||
    (data === undefined && !objectivesQuery.isPending);
  const selectedObjectiveError =
    selection !== portfolioOption && data === undefined && objectivesLoadFailed;
  const startingBalanceLoading = needsPortfolioOverview
    ? portfolio === undefined && portfolioQuery.isPending
    : selectedObjectiveLoading;
  const startingBalanceError = needsPortfolioOverview
    ? portfolio === undefined && portfolioQuery.isError
      ? getErrorMessage(portfolioQuery.error)
      : null
    : selectedObjectiveError
      ? getErrorMessage(objectivesQuery.error)
      : null;
  const startingBalance = needsPortfolioOverview
    ? portfolio
      ? resolvePortfolioProjectionBalance(
          portfolio.positions ?? [],
          data?.objectives ?? [],
          {
            knownTotal: portfolio.insights.totalValue,
            missingPositionCount: 0,
            unvaluedPositionCount: portfolio.insights.unvaluedPositions,
            valuedPositionCount: portfolio.insights.valuedPositions,
          },
          portfolio.insights.totalValue,
        )
      : null
    : data && selectedObjective
      ? resolveObjectiveProjectionBalance(selectedObjective, data.positions)
      : null;

  return (
    <section className="space-y-4" aria-label="Simulador de planejamento">
      <div className="max-w-md space-y-2">
        <label
          htmlFor="planning-source"
          className="text-sm font-medium leading-none"
        >
          Simular com base em
        </label>
        <Select value={selection} onValueChange={setSelection}>
          <SelectTrigger id="planning-source" aria-label="Base da simulação">
            <SelectValue placeholder="Escolha uma base" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={portfolioOption}>Patrimônio total</SelectItem>
            {selectedObjectiveLoading || selectedObjectiveError ? (
              <SelectItem value={selection} disabled>
                {selectedObjectiveLoading
                  ? "Carregando objetivos…"
                  : "Objetivo indisponível"}
              </SelectItem>
            ) : null}
            {availableObjectives.map((objective) => (
              <SelectItem key={objective.id} value={objective.id}>
                {objective.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {objectivesQuery.isPending &&
          !data &&
          selection === portfolioOption && (
            <div
              className="space-y-1"
              role="status"
              aria-label="Carregando objetivos"
            >
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          )}
        {objectivesLoadFailed &&
          (selection === portfolioOption || data !== undefined) && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span className="text-destructive">
                {getErrorMessage(objectivesQuery.error)}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void objectivesQuery.refetch()}
              >
                Recarregar objetivos
              </Button>
            </div>
          )}
      </div>
      {objectiveUnavailable ? (
        <p
          role="alert"
          className="rounded-md border border-dashed p-3 text-sm text-muted-foreground"
        >
          Este objetivo não está disponível para planejamento. Escolha outro
          objetivo ou o patrimônio total.
        </p>
      ) : (
        <>
          <PortfolioObjectiveProjection
            key={`${selection}:${selectedObjective?.id ?? "sem-objetivo"}:${selectedObjective?.targetAmount ?? 0}:${selectedObjective?.monthlyPlannedAmount ?? 0}:${startingBalance?.referenceDate ?? "sem-data"}:${startingBalance?.amount ?? 0}`}
            objective={selectedObjective}
            startingBalance={startingBalance}
            startingBalanceLoading={startingBalanceLoading}
            startingBalanceError={startingBalanceError}
            scenarioLabel={
              selection === portfolioOption
                ? "patrimônio"
                : (selectedObjective?.name ?? "objetivo")
            }
            onRetryStartingBalance={() => {
              if (needsPortfolioOverview) void portfolioQuery.refetch();
              else void objectivesQuery.refetch();
            }}
          />
          {selectedObjective && !startingBalance && !startingBalanceError && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelection(portfolioOption)}
            >
              Usar patrimônio total
            </Button>
          )}
        </>
      )}
    </section>
  );
}
