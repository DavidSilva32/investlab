"use client";

import { ArrowRight, CircleAlert, Target } from "lucide-react";
import { Cell, Pie, PieChart } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { formatCurrency } from "@/lib/utils";
import { DashboardLongTermAllocation } from "@/app/(private)/_components/dashboard-long-term-allocation";
import {
  destinationChartConfig,
  type PortfolioDestinationKey,
} from "@/lib/portfolio-destination-chart";
import type { DashboardLongTermPosition } from "@/app/(private)/_components/dashboard-long-term-allocation";
import { useState } from "react";

export type DashboardDestinationPosition = DashboardLongTermPosition;

export type DashboardDestinationSummary = {
  categories: Array<{
    key: PortfolioDestinationKey;
    value: number;
    percentage: number;
  }>;
  knownTotal: number;
  missingPositionCount: number;
  unvaluedPositionCount: number;
};

const percent = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});

export function DashboardDestinationsOverview({
  summary,
  loading = false,
  unavailable = false,
  onRetry,
  onOpenObjectives,
  positions = [],
  longTermMissingPositionCount = 0,
  readOnly = false,
}: {
  summary?: DashboardDestinationSummary | null;
  loading?: boolean;
  unavailable?: boolean;
  onRetry?: () => void;
  onOpenObjectives?: () => void;
  positions?: DashboardDestinationPosition[];
  longTermMissingPositionCount?: number;
  readOnly?: boolean;
}) {
  const [showLongTerm, setShowLongTerm] = useState(false);
  if (loading && !summary)
    return (
      <Card aria-label="Carregando destinos da carteira" aria-busy="true">
        <CardContent className="flex items-center gap-5 p-5" role="status">
          <span className="sr-only">Carregando destinos da carteira</span>
          <Skeleton className="size-28 shrink-0 rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  if (!summary && !unavailable) return null;
  const chartData = summary
    ? summary.categories
        .filter((category) => category.value > 0)
        .map((category) => ({
          ...category,
          label: destinationChartConfig[category.key].label,
        }))
    : [];
  const longTermCategory = summary?.categories.find(
    (category) => category.key === "long_term",
  );
  const hasLongTermDetail =
    positions.some(
      (position) => position.objectivePurpose === "LONG_TERM_INVESTMENT",
    ) ||
    longTermMissingPositionCount > 0 ||
    (longTermCategory?.value ?? 0) > 0;
  const legendData = [
    ...chartData,
    ...(hasLongTermDetail &&
    !chartData.some((category) => category.key === "long_term")
      ? [
          {
            key: "long_term" as const,
            value: longTermCategory?.value ?? 0,
            percentage: longTermCategory?.percentage ?? 0,
            label: destinationChartConfig.long_term.label,
          },
        ]
      : []),
  ];
  const partial =
    !!summary &&
    summary.missingPositionCount + summary.unvaluedPositionCount > 0;

  return (
    <Card
      className="motion-content-reveal h-full"
      aria-labelledby="dashboard-destinations-title"
    >
      <CardContent className="@container space-y-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2
            id="dashboard-destinations-title"
            className="flex items-center gap-2 text-lg font-semibold"
          >
            <Target aria-hidden="true" className="size-4 text-primary" />
            {showLongTerm
              ? "Investimento de longo prazo"
              : "Destinos da carteira"}
          </h2>
          {!readOnly && (
            <Button
              type="button"
              variant="link"
              onClick={onOpenObjectives}
              className="h-auto min-h-9 w-auto gap-1 px-0 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Objetivos <ArrowRight aria-hidden="true" className="size-3.5" />
            </Button>
          )}
        </div>
        {showLongTerm ? (
          <DashboardLongTermAllocation
            positions={positions.filter(
              (position) =>
                position.objectivePurpose === "LONG_TERM_INVESTMENT",
            )}
            missingPositionCount={longTermMissingPositionCount}
            onBack={() => setShowLongTerm(false)}
          />
        ) : unavailable ? (
          <div
            className="flex flex-wrap items-center justify-between gap-2"
            role="status"
          >
            <span className="text-sm text-muted-foreground">
              Destinos indisponíveis
            </span>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Tentar novamente
            </Button>
          </div>
        ) : chartData.length === 0 && !hasLongTermDetail ? (
          <div className="flex min-h-28 items-center gap-3 text-sm text-muted-foreground">
            <Target aria-hidden="true" className="size-8 text-primary/50" />
            Ainda sem valores conhecidos.
          </div>
        ) : (
          <div className="grid items-center gap-5 @lg:grid-cols-[minmax(12rem,0.85fr)_minmax(0,1.15fr)]">
            {chartData.length > 0 ? (
              <ChartContainer
                config={destinationChartConfig}
                className="mx-auto aspect-square w-full max-w-56 @lg:max-w-none"
                role="img"
                aria-label="Distribuição dos valores conhecidos por destino"
              >
                <PieChart>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => formatCurrency(Number(value))}
                      />
                    }
                  />
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="label"
                    innerRadius="48%"
                    outerRadius="82%"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {chartData.map((category) => (
                      <Cell
                        key={category.key}
                        fill={`var(--color-${category.key})`}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="mx-auto flex aspect-square w-full max-w-56 items-center justify-center rounded-full border border-dashed text-center text-sm text-muted-foreground">
                Sem valores conhecidos
              </div>
            )}
            <ul aria-label="Valores por destino" className="space-y-2">
              {legendData.map((category) => (
                <li
                  key={category.key}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  {category.key === "long_term" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto min-w-0 flex-1 justify-start gap-2 px-0 py-1 text-left text-sm font-normal"
                      aria-label="Ver composição do investimento de longo prazo"
                      onClick={() => setShowLongTerm(true)}
                    >
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            destinationChartConfig[category.key].color,
                        }}
                      />
                      <span className="truncate">{category.label}</span>
                    </Button>
                  ) : (
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            destinationChartConfig[category.key].color,
                        }}
                      />
                      <span className="truncate">{category.label}</span>
                    </span>
                  )}
                  <span className="shrink-0 text-right tabular-nums">
                    <span className="font-medium">
                      {percent.format(category.percentage)}%
                    </span>
                    <span className="block text-xs text-muted-foreground sm:text-sm">
                      {formatCurrency(category.value)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {partial && !unavailable && !showLongTerm && (
          <p
            role="status"
            className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400"
          >
            <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />
            Distribuição parcial · valores conhecidos.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
