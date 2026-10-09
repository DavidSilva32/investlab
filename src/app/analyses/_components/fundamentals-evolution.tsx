"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
type MetricKey = (typeof metrics)[number]["key"];
type ChartPoint = {
  periodLabel: string;
  referenceDate: string | null;
  revenue: number | null;
  netIncome: number | null;
  equity: number | null;
  isPartial: boolean;
};
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
  const currentYear = new Date().getUTCFullYear();
  const years = Array.from(
    { length: 5 },
    (_, index) => currentYear - 4 + index,
  );
  const annual = flowPeriods(periods, years, currentYear);
  const equity = equityBalancePeriods(periods, years, currentYear);
  if (periods.length === 0)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Não há dados suficientes para mostrar a evolução dos fundamentos
        financeiros.
      </p>
    );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {metrics.map((metric) => {
        const allPoints = metric.key === "equity" ? equity : annual;
        const chartData = allPoints;
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
            {chartData.some((period) => period[metric.key] !== null) ? (
              <>
                {chartData.some((point) => point[metric.key] === null) && (
                  <p
                    role="status"
                    className="mt-2 text-xs text-muted-foreground"
                  >
                    Alguns anos não têm dados disponíveis; eles não são tratados
                    como zero.
                  </p>
                )}
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
                          labelFormatter={(label, payload) =>
                            tooltipLabel(metric.key, String(label), payload)
                          }
                          formatter={(value) =>
                            exactMoney.format(Number(value))
                          }
                        />
                      }
                    />
                    <Bar
                      dataKey={metric.key}
                      fill={`var(--color-${metric.key})`}
                      radius={4}
                    >
                      {chartData.map((point) => (
                        <Cell
                          key={point.periodLabel}
                          fillOpacity={point.isPartial ? 0.62 : 1}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </>
            ) : (
              <p role="status" className="mt-2 text-sm text-muted-foreground">
                {metric.key === "equity"
                  ? "Não há saldos de patrimônio líquido disponíveis para os períodos selecionados."
                  : `Não há valores de ${metric.label.toLocaleLowerCase("pt-BR")} disponíveis para os períodos selecionados.`}
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

function flowPeriods(
  periods: AnalysisPeriod[],
  years: number[],
  currentYear: number,
): ChartPoint[] {
  const annual = annualAnalysisPeriods(periods);
  return years.map((year) => {
    const yearLabel = String(year);
    if (year === currentYear) {
      const partial = latestCurrentYearYtd(periods, year);
      return {
        periodLabel: yearLabel,
        referenceDate: partial?.referenceDate ?? null,
        revenue: partial ? value(partial.revenue) : null,
        netIncome: partial ? value(partial.netIncome) : null,
        equity: null,
        isPartial: partial !== null,
      };
    }

    const period = annual.find(
      (candidate) =>
        candidate.referenceDate.slice(0, 4) === yearLabel &&
        (value(candidate.revenue) !== null ||
          value(candidate.netIncome) !== null),
    );
    return {
      periodLabel: yearLabel,
      referenceDate: period?.referenceDate ?? null,
      revenue: value(period?.revenue ?? null),
      netIncome: value(period?.netIncome ?? null),
      equity: null,
      isPartial: false,
    };
  });
}

function latestCurrentYearYtd(periods: AnalysisPeriod[], year: number) {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  return (
    periods
      .filter((period) => {
        const end = period.periodEnd ?? period.referenceDate;
        return (
          period.sourceDocument === "ITR" &&
          period.periodType !== "annual" &&
          period.periodBasis === "year_to_date" &&
          period.isDerived !== true &&
          period.periodStart === yearStart &&
          isValidReferenceDate(period.referenceDate) &&
          isValidReferenceDate(end) &&
          end === period.referenceDate &&
          period.referenceDate.slice(0, 4) === String(year) &&
          period.referenceDate < yearEnd &&
          (value(period.revenue) !== null || value(period.netIncome) !== null)
        );
      })
      .sort((left, right) =>
        left.referenceDate === right.referenceDate
          ? (right.filingReferenceDate ?? "").localeCompare(
              left.filingReferenceDate ?? "",
            )
          : right.referenceDate.localeCompare(left.referenceDate),
      )[0] ?? null
  );
}

function equityBalancePeriods(
  periods: AnalysisPeriod[],
  years: number[],
  currentYear: number,
): ChartPoint[] {
  const annual = annualAnalysisPeriods(periods);
  return years.map((year) => {
    const yearLabel = String(year);
    const annualBalance = annual.find(
      (period) =>
        period.referenceDate === `${yearLabel}-12-31` &&
        value(period.equity) !== null,
    );
    const interimBalances = periods.filter(
      (period) =>
        period.sourceDocument === "ITR" &&
        period.periodType !== "annual" &&
        period.isDerived !== true &&
        period.referenceDate.slice(0, 4) === yearLabel &&
        isValidReferenceDate(period.referenceDate) &&
        value(period.equity) !== null,
    );
    const interimBalance = interimBalances.sort((left, right) =>
      left.referenceDate === right.referenceDate
        ? (right.filingReferenceDate ?? "").localeCompare(
            left.filingReferenceDate ?? "",
          )
        : right.referenceDate.localeCompare(left.referenceDate),
    )[0];
    const selected =
      year === currentYear ? interimBalance : (annualBalance ?? interimBalance);
    return {
      periodLabel: yearLabel,
      referenceDate: selected?.referenceDate ?? null,
      revenue: null,
      netIncome: null,
      equity: value(selected?.equity ?? null),
      isPartial:
        year === currentYear &&
        selected?.referenceDate !== `${yearLabel}-12-31`,
    };
  });
}

function tooltipLabel(
  metric: MetricKey,
  label: string,
  payload: ReadonlyArray<{ payload?: unknown }>,
) {
  const point = payload[0]?.payload as ChartPoint | undefined;
  if (!point) return label;
  if (metric === "equity" && point.referenceDate)
    return `Data-base: ${formatReferenceDate(point.referenceDate)}`;
  if (point.isPartial) return `${point.periodLabel} · Período parcial`;
  return label;
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
