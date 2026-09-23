"use client";

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { AnalysisPeriod } from "./stock-analysis-types";

const metrics = [
  { key: "revenue", label: "Receita", color: "oklch(0.55 0.14 160)" },
  { key: "netIncome", label: "Lucro líquido", color: "oklch(0.58 0.14 240)" },
  { key: "equity", label: "Patrimônio líquido", color: "oklch(0.62 0.14 310)" },
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
  const annual = periods
    .filter((period) => period.sourceDocument === "DFP")
    .slice()
    .sort((left, right) =>
      left.referenceDate.localeCompare(right.referenceDate),
    )
    .map((period) => ({
      year: period.referenceDate.slice(0, 4),
      revenue: value(period.revenue),
      netIncome: value(period.netIncome),
      equity: value(period.equity),
    }));

  if (!annual.length) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {metrics.map((metric) => {
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
            <ChartContainer
              config={config}
              className="mt-2 h-52 w-full aspect-auto"
            >
              <BarChart data={annual} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="year" tickLine={false} axisLine={false} />
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
            <ul
              aria-label={`Valores exatos de ${metric.label} por exercício`}
              className="mt-3 space-y-1 border-t pt-3 text-xs"
            >
              {annual.map((period) => (
                <li key={period.year} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{period.year}</span>
                  <span className="text-right font-medium tabular-nums">
                    {period[metric.key] === null
                      ? "Não informado"
                      : exactMoney.format(period[metric.key]!)}
                  </span>
                </li>
              ))}
            </ul>
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
