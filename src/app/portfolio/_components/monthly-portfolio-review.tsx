"use client";

import { useId, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  ChartSpline,
  Minus,
} from "lucide-react";
import type {
  MonthlyPortfolioHistoryPoint,
  MonthlyPortfolioReview as MonthlyPortfolioReviewData,
} from "@/backend/services/monthly-portfolio-review";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrencyCents } from "@/lib/portfolio-money";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const monthFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const shortMonthFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});
function formatDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}

function formatMonth(value: string) {
  return monthFormatter.format(new Date(`${value}-01T00:00:00Z`));
}

function formatShortMonth(value: string) {
  return shortMonthFormatter.format(new Date(`${value}-01T00:00:00Z`));
}

function formatChange(value: string) {
  const cents = BigInt(value);
  return `${cents > 0n ? "+" : ""}${formatCurrencyCents(cents)}`;
}

export function MonthlyPortfolioReview({
  review,
  selectedPeriod,
  loading,
  error,
  onPeriodChange,
  onRetry,
}: {
  review: MonthlyPortfolioReviewData | undefined;
  selectedPeriod: string | null;
  loading: boolean;
  error?: string;
  onPeriodChange: (period: string) => void;
  onRetry: () => void;
}) {
  const [chartType, setChartType] = useState<"area" | "bar">("area");
  const chartId = useId().replace(/:/g, "");
  const hasHistory = Boolean(review?.history.length);
  const singleClose = review?.history.length === 1;
  const selectedHistoryPoint = review?.history.find(
    (point) => point.period === review.selectedPeriod,
  );
  const showPartialWarning =
    review?.status === "partial" ||
    selectedHistoryPoint?.completeness === "partial";
  const showSelectedSummary =
    !loading && !error && hasHistory && Boolean(review?.current);
  const periodSelector =
    review && review.availablePeriods.length > 1 ? (
      <div>
        <label className="sr-only" htmlFor="monthly-review-period">
          Mês de referência
        </label>
        <Select
          value={selectedPeriod ?? review.selectedPeriod ?? undefined}
          onValueChange={onPeriodChange}
        >
          <SelectTrigger
            id="monthly-review-period"
            className="h-8 w-auto gap-1 border-0 bg-transparent px-1 text-xs text-muted-foreground shadow-none"
          >
            <CalendarDays aria-hidden="true" className="size-3.5" />
            <SelectValue placeholder="Escolha um mês" />
          </SelectTrigger>
          <SelectContent>
            {review.availablePeriods.map((period) => (
              <SelectItem key={period} value={period}>
                {formatMonth(period)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    ) : null;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center gap-x-3 gap-y-2 space-y-0 p-3 sm:px-4 lg:flex-nowrap">
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ChartSpline aria-hidden="true" className="size-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold leading-none tracking-tight">
              Evolução patrimonial
            </h2>
          </div>
        </div>
        {showSelectedSummary && review?.current && (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
            {!singleClose && periodSelector ? (
              periodSelector
            ) : (
              <span className="text-xs text-muted-foreground">
                {formatDate(review.current.referenceDate)}
              </span>
            )}
            <span className="text-base font-semibold tabular-nums tracking-tight">
              {formatCurrencyCents(review.current.knownValueCents)}
            </span>
            {review.history.length > 1 &&
              review.observedChangeCents !== null && (
                <span
                  role="img"
                  aria-label={`Diferença observada: ${formatChange(review.observedChangeCents)}`}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-medium tabular-nums"
                >
                  {BigInt(review.observedChangeCents) < 0n ? (
                    <ArrowDownRight aria-hidden="true" className="size-3.5" />
                  ) : BigInt(review.observedChangeCents) > 0n ? (
                    <ArrowUpRight aria-hidden="true" className="size-3.5" />
                  ) : (
                    <Minus aria-hidden="true" className="size-3.5" />
                  )}
                  {formatChange(review.observedChangeCents)}
                </span>
              )}
          </div>
        )}
        {!loading && !error && !showSelectedSummary && periodSelector && (
          <div className="ml-auto">{periodSelector}</div>
        )}
        {!loading && !error && hasHistory && (
          <div
            className="ml-auto inline-flex shrink-0 rounded-lg border bg-muted/40 p-1"
            role="group"
            aria-label="Tipo de gráfico"
          >
            <Button
              type="button"
              variant={chartType === "area" ? "secondary" : "ghost"}
              size="icon"
              className="size-8 rounded-md"
              aria-label="Gráfico de área"
              aria-pressed={chartType === "area"}
              onClick={() => setChartType("area")}
            >
              <ChartSpline aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant={chartType === "bar" ? "secondary" : "ghost"}
              size="icon"
              className="size-8 rounded-md"
              aria-label="Gráfico de barras"
              aria-pressed={chartType === "bar"}
              onClick={() => setChartType("bar")}
            >
              <ChartNoAxesColumnIncreasing aria-hidden="true" />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && (
          <p
            className="flex items-center gap-2 text-sm text-muted-foreground"
            role="status"
          >
            <CalendarDays aria-hidden="true" className="size-4" />
            Carregando histórico…
          </p>
        )}
        {error && (
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Tentar novamente
            </Button>
          </div>
        )}
        {!loading && !error && review?.status === "no_history" && (
          <p
            className="flex items-center gap-2 text-sm text-muted-foreground"
            role="status"
          >
            <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
            Importe um fechamento para ver sua evolução.
          </p>
        )}
        {!loading && !error && review?.status === "missing_snapshot" && (
          <p
            className="flex items-center gap-2 text-sm text-muted-foreground"
            role="status"
          >
            <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
            Sem fechamento neste mês.
          </p>
        )}
        {!loading && !error && hasHistory && review && (
          <PortfolioEvolutionChart
            type={chartType}
            id={chartId}
            history={review.history}
          />
        )}
        {!loading && !error && showPartialWarning && review && (
          <p
            className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300"
            role="status"
          >
            <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
            {partialExplanation(review)}
          </p>
        )}
        {!loading && !error && review?.status === "insufficient_values" && (
          <p
            className="flex items-center gap-2 text-xs text-muted-foreground"
            role="status"
          >
            <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
            Valores insuficientes para comparar.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

type EvolutionPoint =
  | {
      month: string;
      value: number | null;
      cents: string | null;
      referenceDate: string;
      isPartial: boolean;
      hasRecord: true;
    }
  | {
      month: string;
      value: null;
      cents: null;
      referenceDate: null;
      isPartial: false;
      hasRecord: false;
    };

const evolutionChartConfig = {
  value: { label: "Patrimônio conhecido", color: "var(--primary)" },
} satisfies ChartConfig;

function centsToChartValue(cents: string) {
  const value = BigInt(cents);
  const whole = value / 100n;
  const fractional = value % 100n;
  return Number(whole) + Number(fractional) / 100;
}

function chartPoints(
  history: MonthlyPortfolioHistoryPoint[],
): EvolutionPoint[] {
  const pointsByMonth = new Map(history.map((point) => [point.period, point]));
  const [firstYear, firstMonth] = history[0].period.split("-").map(Number);
  const lastPoint = history[history.length - 1];
  const [lastYear, lastMonth] = lastPoint.period.split("-").map(Number);
  const points: EvolutionPoint[] = [];
  let year = firstYear;
  let month = firstMonth;

  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    const period = `${year}-${String(month).padStart(2, "0")}`;
    const historyPoint = pointsByMonth.get(period);
    if (historyPoint) {
      const { summary } = historyPoint;
      points.push({
        month: period,
        value:
          summary.knownValueCents === null
            ? null
            : centsToChartValue(summary.knownValueCents),
        cents: summary.knownValueCents,
        referenceDate: summary.referenceDate,
        isPartial: historyPoint.completeness === "partial",
        hasRecord: true,
      });
    } else {
      points.push({
        month: period,
        value: null,
        cents: null,
        referenceDate: null,
        isPartial: false,
        hasRecord: false,
      });
    }

    if (month === 12) {
      year += 1;
      month = 1;
    } else {
      month += 1;
    }
  }

  return points;
}

function PortfolioEvolutionChart({
  type,
  id,
  history,
}: {
  type: "area" | "bar";
  id: string;
  history: MonthlyPortfolioHistoryPoint[];
}) {
  const points = chartPoints(history);
  const minimumChartWidth = Math.max(320, points.length * 40);
  const tooltip = (
    <ChartTooltipContent
      labelFormatter={(label) =>
        typeof label === "string" ? formatMonth(label) : ""
      }
      formatter={(_value, _name, item) => {
        const point = item.payload as EvolutionPoint;
        const amount = formatCurrencyCents(point.cents);
        const referenceDate = point.referenceDate
          ? ` · referência ${formatDate(point.referenceDate)}`
          : "";
        return `${amount}${point.isPartial ? " · parcial" : ""}${referenceDate}`;
      }}
    />
  );

  return (
    <>
      <p className="sr-only">
        {points
          .map((point) =>
            point.hasRecord
              ? `${formatMonth(point.month)}: ${formatCurrencyCents(point.cents)}${point.isPartial ? ", valor parcial" : ""}, referência ${formatDate(point.referenceDate)}`
              : `${formatMonth(point.month)}: sem fechamento registrado`,
          )
          .join(". ")}
        . A série mostra valores registrados, não rentabilidade.
      </p>
      <div
        className="overflow-x-auto overscroll-x-contain"
        role="region"
        tabIndex={0}
        aria-label="Deslize horizontalmente para ver todos os meses"
      >
        <ChartContainer
          config={evolutionChartConfig}
          className="h-52 w-full aspect-auto sm:h-60"
          style={{ minWidth: `${minimumChartWidth}px` }}
          aria-label="Gráfico da evolução do patrimônio conhecido"
        >
          {type === "area" ? (
            <AreaChart
              accessibilityLayer
              data={points}
              margin={{
                top: points.length === 1 ? 28 : 12,
                right: 12,
                left: 8,
                bottom: 0,
              }}
            >
              <defs>
                <linearGradient
                  id={`portfolio-area-${id}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="var(--primary)"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--primary)"
                    stopOpacity={0.02}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                minTickGap={32}
                interval="preserveStartEnd"
                tickFormatter={formatShortMonth}
              />
              <YAxis
                width={72}
                domain={[0, "auto"]}
                hide={points.length === 1}
                tickLine={false}
                axisLine={false}
                tickFormatter={compactCurrency}
              />
              <Tooltip cursor={false} content={tooltip} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--color-value)"
                strokeWidth={2}
                fill={`url(#portfolio-area-${id})`}
                dot={
                  points.length === 1
                    ? {
                        r: 6,
                        fill: "var(--color-value)",
                        stroke: "var(--background)",
                        strokeWidth: 2,
                      }
                    : false
                }
                activeDot={{ r: 5 }}
                isAnimationActive={points.length > 1}
                connectNulls={false}
              />
            </AreaChart>
          ) : (
            <BarChart
              accessibilityLayer
              data={points}
              margin={{ top: 12, right: 12, left: 8, bottom: 0 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                minTickGap={32}
                interval="preserveStartEnd"
                tickFormatter={formatShortMonth}
              />
              <YAxis
                width={72}
                domain={[0, "auto"]}
                tickLine={false}
                axisLine={false}
                tickFormatter={compactCurrency}
              />
              <Tooltip cursor={false} content={tooltip} />
              <Bar
                dataKey="value"
                fill="var(--color-value)"
                radius={4}
                isAnimationActive
              />
            </BarChart>
          )}
        </ChartContainer>
      </div>
    </>
  );
}

function compactCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function partialExplanation(review: MonthlyPortfolioReviewData) {
  if (review.untrackedManualPositionCount > 0)
    return "Histórico manual incompleto.";
  if (
    (review.current && review.current.unvaluedPositionCount > 0) ||
    (review.previous && review.previous.unvaluedPositionCount > 0)
  ) {
    return "Algumas posições estão sem valor.";
  }
  if (
    review.dateAlignment === "outdated" ||
    review.dateAlignment === "different_dates"
  ) {
    return "Datas de avaliação diferentes.";
  }
  if (review.compositionCoverage === "changed")
    return "A carteira mudou entre os períodos.";
  if (review.compositionCoverage === "unknown")
    return "Cobertura da carteira não confirmada.";
  if (review.gapMonths > 0) return "Há meses sem fechamento.";
  return "Comparação parcial.";
}
