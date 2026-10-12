"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PortfolioObjectiveProjection } from "@/app/portfolio/_components/portfolio-objective-projection";
import type { ObjectivePosition } from "@/app/portfolio/_components/portfolio-objective-assignment";
import type { PortfolioObjective } from "@/app/portfolio/_components/portfolio-objective-card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

  if (
    objectivesQuery.isPending ||
    (needsPortfolioOverview && portfolioQuery.isPending)
  ) {
    return (
      <div
        className="h-56 animate-pulse rounded-xl border bg-card"
        aria-label="Carregando dados do planejamento"
        role="status"
      />
    );
  }
  if (
    objectivesQuery.isError ||
    !data ||
    (needsPortfolioOverview && (portfolioQuery.isError || !portfolioQuery.data))
  ) {
    const error = objectivesQuery.isError
      ? objectivesQuery.error
      : portfolioQuery.error;
    return (
      <div role="alert" className="space-y-3 rounded-xl border p-4">
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : loadErrorMessage}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void objectivesQuery.refetch();
            if (needsPortfolioOverview) void portfolioQuery.refetch();
          }}
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  const availableObjectives = data.objectives.filter(
    (objective) =>
      objective.kind !== "RESERVE" && objective.id !== reserveObjectiveId,
  );
  const selectedObjective =
    selection === portfolioOption
      ? null
      : (availableObjectives.find((objective) => objective.id === selection) ??
        null);
  const invalidObjective =
    selection !== portfolioOption && selectedObjective === null;
  const startingBalance =
    selection === portfolioOption
      ? resolvePortfolioProjectionBalance(
          portfolioQuery.data?.positions ?? [],
          data.objectives,
          {
            ...data.destinationSummary,
            // Objective assignment gaps must not hide the known portfolio total.
            missingPositionCount: 0,
            unvaluedPositionCount:
              portfolioQuery.data?.insights.unvaluedPositions ??
              data.destinationSummary.unvaluedPositionCount,
            valuedPositionCount: portfolioQuery.data?.insights.valuedPositions,
          },
          portfolioQuery.data?.insights.totalValue,
        )
      : resolveObjectiveProjectionBalance(selectedObjective, data.positions);

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
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={portfolioOption}>Patrimônio total</SelectItem>
            {availableObjectives.map((objective) => (
              <SelectItem key={objective.id} value={objective.id}>
                {objective.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {invalidObjective ? (
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
            key={`${selection}:${startingBalance?.referenceDate ?? "sem-data"}:${startingBalance?.amount ?? 0}`}
            objective={selectedObjective ?? null}
            startingBalance={startingBalance}
          />
          {selectedObjective && !startingBalance && (
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
