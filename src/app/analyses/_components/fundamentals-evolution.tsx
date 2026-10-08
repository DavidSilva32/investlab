"use client";

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  annualAnalysisPeriods,
  type AnalysisPeriod,
} from "./stock-analysis-types";

const metrics = [
  { key: "revenue", label: "Receita", color: "var(--chart-category-1)" },
  {
    key: "netIncome",
    label: "Lucro líquido",
    color: "var(--chart-category-5)",
  },
  {
    key: "equity",
    label: "Patrimônio líquido",
    color: "var(--chart-category-4)",
  },
] as const;
const exactMoney = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const compactMoney = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function FundamentalsEvolution({
  periods,
}: {
  periods: AnalysisPeriod[];
}) {
  const annual = annualAnalysisPeriods(periods).map((period) => ({
    periodLabel: period.referenceDate.slice(0, 4),
    revenue: value(period.revenue),
    netIncome: value(period.netIncome),
    equity: value(period.equity),
  }));
  const equity = equityBalancePeriods(periods);

  if (!annual.length && !equity.length)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Não há demonstrativos anuais ou saldos de patrimônio líquido disponíveis
        nos dados recebidos.
      </p>
    );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {metrics.map((metric) => {
        const chartData = metric.key === "equity" ? equity : annual;
        const config: ChartConfig = {
          [metric.key]: { label: metric.label, color: metric.color },
        };
        const id = `annual-${metric.key}`;
        return (
          <section
            key={metric.key}
            aria-labelledby={`${id}-title`}
            className="min-w-0 rounded-lg border bg-card p-4"
          >
            <h3 id={`${id}-title`} className="font-medium">
              {metric.label}
            </h3>
            {metric.key === "equity" && chartData.length > 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                {equityDescription(equity)}
              </p>
            )}
            {chartData.some((period) => period[metric.key] !== null) ? (
              <ChartContainer
                config={config}
                className="mt-2 h-52 w-full aspect-auto"
              >
                <BarChart data={chartData} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="periodLabel"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    width={64}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(number: number) =>
                      compactMoney.format(number)
                    }
                  />
                  <Tooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        formatter={(value) => exactMoney.format(Number(value))}
                      />
                    }
                  />
                  <Bar
                    dataKey={metric.key}
                    fill={`var(--color-${metric.key})`}
                    radius={4}
                  />
                </BarChart>
              </ChartContainer>
            ) : (
              <p role="status" className="mt-2 text-sm text-muted-foreground">
                {metric.key === "equity"
                  ? "Não há saldos de patrimônio líquido válidos nos períodos DFP ou ITR disponíveis."
                  : `Não há valores anuais de ${metric.label.toLocaleLowerCase("pt-BR")} disponíveis nos demonstrativos DFP.`}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function value(source: string | null) {
  if (source === null) return null;
  const parsed = Number(source);
  return Number.isFinite(parsed) ? parsed : null;
}

function equityBalancePeriods(periods: AnalysisPeriod[]) {
  const byDate = new Map<string, AnalysisPeriod>();
  const candidates = [
    ...annualAnalysisPeriods(periods).filter(
      (period) => value(period.equity) !== null,
    ),
    ...periods.filter(
      (period) =>
        period.sourceDocument === "ITR" &&
        period.periodType !== "annual" &&
        !period.isDerived &&
        value(period.equity) !== null,
    ),
  ];
  for (const period of candidates) {
    if (
      !isValidReferenceDate(period.referenceDate) ||
      value(period.equity) === null
    )
      continue;
    const existing = byDate.get(period.referenceDate);
    if (
      !existing ||
      (existing.sourceDocument === "ITR" && period.sourceDocument === "DFP") ||
      (existing.sourceDocument === period.sourceDocument &&
        (period.filingReferenceDate ?? "") >
          (existing.filingReferenceDate ?? ""))
    )
      byDate.set(period.referenceDate, period);
  }
  return [...byDate.values()]
    .sort((left, right) =>
      left.referenceDate.localeCompare(right.referenceDate),
    )
    .map((period) => ({
      periodLabel: formatReferenceDate(period.referenceDate),
      revenue: null,
      netIncome: null,
      equity: value(period.equity),
      sourceDocument: period.sourceDocument,
    }));
}

function equityDescription(equity: ReturnType<typeof equityBalancePeriods>) {
  const hasAnnual = equity.some((period) => period.sourceDocument === "DFP");
  const hasInterim = equity.some((period) => period.sourceDocument === "ITR");
  if (hasAnnual && hasInterim)
    return "Saldos DFP anuais e ITR intermediários, com a data-base de cada ponto.";
  if (hasInterim)
    return "Saldos intermediários ITR, identificados pela data-base real.";
  return "Saldos anuais DFP, identificados pela data-base real.";
}

function formatReferenceDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00.000Z`),
  );
}

function isValidReferenceDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
