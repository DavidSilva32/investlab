"use client";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatCurrency } from "@/lib/utils";
import { Cell, Pie, PieChart } from "recharts";

export type PortfolioDestinationValue = {
  key: "reserve" | "personal" | "long_term" | "purpose_unknown" | "unassigned";
  value: number;
  percentage: number;
};

const destinationConfig = {
  reserve: { label: "Reserva", color: "var(--destination-reserve)" },
  personal: {
    label: "Objetivos pessoais",
    color: "var(--destination-personal)",
  },
  long_term: {
    label: "Investimento de longo prazo",
    color: "var(--destination-long-term)",
  },
  purpose_unknown: {
    label: "Finalidade não definida",
    color: "var(--destination-purpose-unknown)",
  },
  unassigned: { label: "Sem destino", color: "var(--destination-unassigned)" },
} satisfies ChartConfig;
const percentageFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function PortfolioChatWealthChart({
  categories,
  knownTotal,
}: {
  categories: PortfolioDestinationValue[];
  knownTotal: number;
}) {
  const chartData = categories
    .filter(
      (category) =>
        Number.isFinite(category.value) &&
        category.value > 0 &&
        Number.isFinite(category.percentage),
    )
    .map((category) => ({
      ...category,
      label: destinationConfig[category.key].label,
    }));

  if (chartData.length === 0) {
    return (
      <section
        className="mt-3 w-full max-w-sm rounded-lg border border-border/70 bg-background/40 px-3 py-2.5"
        aria-label="Patrimônio conhecido"
      >
        <span className="block text-[11px] text-muted-foreground">
          Patrimônio conhecido
        </span>
        <span className="block text-base font-semibold tabular-nums text-primary">
          {formatCurrency(knownTotal)}
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          Sem distribuição confirmada por destino.
        </span>
      </section>
    );
  }

  return (
    <section
      className="mt-3 w-full max-w-sm"
      aria-label="Patrimônio por destino"
    >
      <div className="relative mx-auto h-48 w-full max-w-64">
        <ChartContainer
          config={destinationConfig}
          className="mx-auto h-full w-full"
          role="img"
          aria-label={`Gráfico de rosca do patrimônio conhecido, total ${formatCurrency(knownTotal)}, por destino: ${chartData
            .map(
              (category) =>
                `${category.label}, ${formatCurrency(category.value)}, ${percentageFormatter.format(category.percentage)}%`,
            )
            .join("; ")}`}
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
              innerRadius={55}
              outerRadius={82}
              strokeWidth={3}
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
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] leading-tight text-muted-foreground">
            Patrimônio conhecido
          </span>
          <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-primary">
            {formatCurrency(knownTotal)}
          </span>
        </div>
      </div>
      <ul
        className="grid gap-1.5"
        aria-label="Distribuição do patrimônio por destino"
      >
        {chartData.map((category) => (
          <li
            key={category.key}
            className="flex items-center justify-between gap-3 text-xs"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{
                  backgroundColor: destinationConfig[category.key].color,
                }}
              />
              <span className="truncate">{category.label}</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums">
              {formatCurrency(category.value)} ·{" "}
              {percentageFormatter.format(category.percentage)}%
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
