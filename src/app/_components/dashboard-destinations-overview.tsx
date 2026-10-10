"use client";

import Link from "next/link";
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
import { destinationChartConfig } from "@/app/portfolio/_components/portfolio-objectives-overview";

export type DashboardDestinationSummary = {
  categories: Array<{
    key: keyof typeof destinationChartConfig;
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
}: {
  summary?: DashboardDestinationSummary | null;
  loading?: boolean;
  unavailable?: boolean;
  onRetry?: () => void;
}) {
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
  const partial =
    !!summary &&
    summary.missingPositionCount + summary.unvaluedPositionCount > 0;

  return (
    <Card className="h-full" aria-labelledby="dashboard-destinations-title">
      <CardContent className="space-y-3 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2
            id="dashboard-destinations-title"
            className="flex items-center gap-2 text-base font-semibold"
          >
            <Target aria-hidden="true" className="size-4 text-primary" />
            Destinos da carteira
          </h2>
          <Link
            href="/portfolio?panel=objectives"
            className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Objetivos <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </div>
        {unavailable ? (
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
        ) : chartData.length === 0 ? (
          <div className="flex min-h-28 items-center gap-3 text-sm text-muted-foreground">
            <Target aria-hidden="true" className="size-8 text-primary/50" />
            Ainda sem valores conhecidos.
          </div>
        ) : (
          <div className="grid items-center gap-3 min-[400px]:grid-cols-[120px_minmax(0,1fr)]">
            <ChartContainer
              config={destinationChartConfig}
              className="mx-auto size-30"
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
                  innerRadius={34}
                  outerRadius={52}
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
            <ul aria-label="Valores por destino" className="space-y-2">
              {chartData.map((category) => (
                <li
                  key={category.key}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="flex min-w-0 items-center gap-2">
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
                  <span className="shrink-0 text-right tabular-nums">
                    <span className="font-medium">
                      {percent.format(category.percentage)}%
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {formatCurrency(category.value)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {partial && !unavailable && (
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
