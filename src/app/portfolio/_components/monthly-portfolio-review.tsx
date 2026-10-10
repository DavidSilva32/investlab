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
import { ChartNoAxesColumnIncreasing, ChartSpline } from "lucide-react";
import type { MonthlyPortfolioReview as MonthlyPortfolioReviewData } from "@/backend/services/monthly-portfolio-review";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
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
const timestampFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
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

function formatTimestamp(value: string) {
  return timestampFormatter.format(new Date(value));
}

function formatChange(value: string) {
  const cents = BigInt(value);
  return `${cents > 0n ? "+" : ""}${formatCurrencyCents(cents)}`;
}

function changedMethods(current: string[], previous: string[]) {
  if (current.length !== previous.length) return true;
  return current.some((method, index) => method !== previous[index]);
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
  const selectedChartPeriod = review?.selectedPeriod;
  const previousPeriod = selectedChartPeriod
    ? review?.availablePeriods.find((period) => period < selectedChartPeriod)
    : undefined;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold leading-none tracking-tight">
            Evolução patrimonial
          </h2>
          <CardDescription>Valores registrados na carteira</CardDescription>
        </div>
        {review && review.availablePeriods.length > 0 && (
          <div className="grid min-w-40 gap-1.5">
            <label
              className="text-xs font-medium text-muted-foreground"
              htmlFor="monthly-review-period"
            >
              Mês de referência
            </label>
            <Select
              value={selectedPeriod ?? review.selectedPeriod ?? undefined}
              onValueChange={onPeriodChange}
            >
              <SelectTrigger id="monthly-review-period">
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
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && (
          <p className="text-sm text-muted-foreground" role="status">
            Carregando fechamentos importados…
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
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            O histórico aparecerá após o primeiro fechamento da carteira.
          </p>
        )}
        {!loading && !error && review?.status === "missing_snapshot" && (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            Não há fechamento registrado neste mês.
          </p>
        )}
        {!loading && !error && review?.current && (
          <div className="space-y-3">
            {review.status === "no_previous_close" && (
              <div className="flex flex-col gap-1 rounded-lg border border-dashed p-3 sm:flex-row sm:items-baseline sm:justify-between">
                <span className="text-sm text-muted-foreground">
                  Primeiro fechamento registrado
                </span>
                <span className="text-lg font-semibold tabular-nums">
                  {formatCurrencyCents(review.current.knownValueCents)}
                </span>
                <span className="sr-only">
                  Ainda não há outro fechamento para comparar.
                </span>
              </div>
            )}
            {review.previous &&
              review.current &&
              review.previous.knownValueCents !== null &&
              review.current.knownValueCents !== null && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      {review.observedChangeCents !== null && (
                        <>
                          <span className="text-sm text-muted-foreground">
                            {review.status === "partial"
                              ? "Diferença entre valores conhecidos"
                              : "Diferença observada"}
                          </span>
                          <span className="font-semibold tabular-nums">
                            {formatChange(review.observedChangeCents)}
                          </span>
                        </>
                      )}
                    </div>
                    <div
                      className="inline-flex rounded-md border p-0.5"
                      role="group"
                      aria-label="Tipo de gráfico"
                    >
                      <Button
                        type="button"
                        variant={chartType === "area" ? "secondary" : "ghost"}
                        size="icon"
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
                        aria-label="Gráfico de barras"
                        aria-pressed={chartType === "bar"}
                        onClick={() => setChartType("bar")}
                      >
                        <ChartNoAxesColumnIncreasing aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                  <PortfolioEvolutionChart
                    type={chartType}
                    id={chartId}
                    points={[
                      {
                        month:
                          previousPeriod ??
                          review.previous.referenceDate.slice(0, 7),
                        value: centsToChartValue(
                          review.previous.knownValueCents,
                        ),
                        cents: review.previous.knownValueCents,
                      },
                      {
                        month:
                          selectedChartPeriod ??
                          review.current.referenceDate.slice(0, 7),
                        value: centsToChartValue(
                          review.current.knownValueCents,
                        ),
                        cents: review.current.knownValueCents,
                      },
                    ]}
                  />
                </div>
              )}
            {review.status === "no_previous_close" && (
              <p className="text-xs text-muted-foreground">
                Registre outro fechamento para comparar os períodos.
              </p>
            )}
            {review.status === "insufficient_values" && (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Não há valores suficientes nos dois períodos para comparar.
              </p>
            )}
            {review.status === "partial" && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">
                {partialExplanation(review)} A diferença considera apenas os
                valores conhecidos.
              </p>
            )}
            <details className="group rounded-lg border px-3 py-2 text-sm">
              <summary className="cursor-pointer font-medium text-muted-foreground">
                Detalhes dos valores
              </summary>
              <div className="mt-3 space-y-3 text-muted-foreground">
                {review.untrackedManualPositionCount > 0 && (
                  <p>
                    {review.untrackedManualPositionCount === 1
                      ? "1 posição manual"
                      : `${review.untrackedManualPositionCount} posições manuais`}{" "}
                    sem histórico anterior. Valores substituídos antes do
                    primeiro registro não podem ser recuperados.
                  </p>
                )}
                {review.previous && (
                  <p>
                    Fontes iguais:{" "}
                    {review.compositionCoverage === "equivalent"
                      ? "sim"
                      : "não comprovado"}
                    .
                    {review.gapMonths > 0 && (
                      <>
                        {" "}
                        Há {review.gapMonths}{" "}
                        {review.gapMonths === 1 ? "mês" : "meses"} sem
                        fechamento entre os períodos.
                      </>
                    )}
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <SnapshotSources
                    title={
                      review.previous
                        ? "Período anterior"
                        : "Período selecionado"
                    }
                    snapshot={review.previous ?? review.current}
                  />
                  {review.previous && (
                    <SnapshotSources
                      title="Período selecionado"
                      snapshot={review.current}
                    />
                  )}
                </div>
                {review.previous &&
                  changedMethods(
                    review.previous.valuationMethods,
                    review.current.valuationMethods,
                  ) && (
                    <p>
                      Os critérios de avaliação registrados mudaram entre os
                      períodos.
                    </p>
                  )}
                {(review.current.valuationMethods.includes(
                  "MANUAL_CONVERTED",
                ) ||
                  review.previous?.valuationMethods.includes(
                    "MANUAL_CONVERTED",
                  )) && (
                  <p>
                    Para ativos em outra moeda, usamos o valor em reais
                    informado. Ele pode refletir uma cotação de data diferente.
                  </p>
                )}
                <p className="border-t pt-3">
                  {review.flowSeparation.explanation}
                </p>
              </div>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type EvolutionPoint = {
  month: string;
  value: number;
  cents: string;
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

function PortfolioEvolutionChart({
  type,
  id,
  points,
}: {
  type: "area" | "bar";
  id: string;
  points: EvolutionPoint[];
}) {
  const dateLabel = (month: string) => formatMonth(month);
  const tooltip = (
    <ChartTooltipContent
      labelFormatter={(label) =>
        typeof label === "string" ? dateLabel(label) : ""
      }
      formatter={(_value, _name, item) =>
        formatCurrencyCents(item.payload.cents)
      }
    />
  );

  return (
    <>
      <p className="sr-only">
        Patrimônio conhecido: {formatCurrencyCents(points[0].cents)} em{" "}
        {dateLabel(points[0].month)} e {formatCurrencyCents(points[1].cents)} em{" "}
        {dateLabel(points[1].month)}. A diferença observada não representa
        rentabilidade.
      </p>
      <ChartContainer
        config={evolutionChartConfig}
        className="h-52 w-full aspect-auto sm:h-60"
        aria-label="Gráfico da evolução do patrimônio conhecido"
      >
        {type === "area" ? (
          <AreaChart
            accessibilityLayer
            data={points}
            margin={{ top: 12, right: 12, left: 8, bottom: 0 }}
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
              minTickGap={24}
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
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--color-value)"
              strokeWidth={2}
              fill={`url(#portfolio-area-${id})`}
              dot={{ r: 3 }}
              activeDot={{ r: 4 }}
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
              minTickGap={24}
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

function SnapshotSources({
  title,
  snapshot,
}: {
  title: string;
  snapshot: NonNullable<MonthlyPortfolioReviewData["current"]>;
}) {
  return (
    <section className="min-w-0 space-y-1">
      <h3 className="font-medium text-foreground">{title}</h3>
      {snapshot.sourceReferences.map((reference, index) => (
        <p key={`${reference.source}-${reference.referenceDate}-${index}`}>
          {reference.source}: posição avaliada em{" "}
          {formatDate(reference.referenceDate)}
          {reference.recordedAt &&
            ` · ${reference.source === "Valor informado" ? "salvo" : "registro"} em ${formatTimestamp(reference.recordedAt)}`}
          {reference.importedAt &&
            ` · importada em ${formatTimestamp(reference.importedAt)}`}
        </p>
      ))}
      {snapshot.manualPositionDates.length > 0 && (
        <p>
          Datas dos valores manuais:{" "}
          {snapshot.manualPositionDates.map(formatDate).join(", ")}
        </p>
      )}
      {snapshot.manualConversionDates.length > 0 && (
        <p>
          Conversão para reais:{" "}
          {snapshot.manualConversionDates.map(formatDate).join(", ")}
        </p>
      )}
    </section>
  );
}

function partialExplanation(review: MonthlyPortfolioReviewData) {
  if (review.untrackedManualPositionCount > 0)
    return "O histórico manual ainda não cobre os dois períodos.";
  if (
    (review.current && review.current.unvaluedPositionCount > 0) ||
    (review.previous && review.previous.unvaluedPositionCount > 0)
  ) {
    return "Há posições sem valor conhecido.";
  }
  if (
    review.dateAlignment === "outdated" ||
    review.dateAlignment === "different_dates"
  ) {
    return "As datas de avaliação não coincidem.";
  }
  if (review.compositionCoverage === "changed")
    return "As fontes ou posições mudaram entre os períodos.";
  if (review.compositionCoverage === "unknown")
    return "Não foi possível confirmar todas as posições nos dois períodos.";
  if (review.gapMonths > 0)
    return "Faltam fechamentos em meses intermediários.";
  return "A cobertura da carteira não pode ser confirmada.";
}
