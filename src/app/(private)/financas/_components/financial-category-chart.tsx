"use client";

import { useMemo, useState } from "react";
import { Cell, Pie, PieChart } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/utils";

export type FinancialCategoryAmount = {
  categoryId: string;
  categoryName: string;
  amount: string;
};

const chartColors = [
  "var(--chart-category-1)",
  "var(--chart-category-2)",
  "var(--chart-category-3)",
  "var(--chart-category-4)",
  "var(--chart-category-5)",
  "var(--chart-category-6)",
];

export function FinancialCategoryChart({
  income,
  expenses,
}: {
  income: FinancialCategoryAmount[];
  expenses: FinancialCategoryAmount[];
}) {
  const [kind, setKind] = useState<"expenses" | "income">("expenses");
  const data = kind === "expenses" ? expenses : income;
  const chartData = useMemo(
    () =>
      data
        .map((item, index) => ({
          ...item,
          value: Number(item.amount),
          series: `category${index}`,
          color: chartColors[index % chartColors.length],
        }))
        .filter((item) => item.value > 0)
        .sort((left, right) => right.value - left.value),
    [data],
  );
  const chartConfig = Object.fromEntries(
    chartData.map((item) => [
      item.series,
      { label: item.categoryName, color: item.color },
    ]),
  ) satisfies ChartConfig;
  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
        <CardTitle className="text-lg">Por categoria</CardTitle>
        <Tabs
          value={kind}
          onValueChange={(value) => setKind(value as typeof kind)}
        >
          <TabsList aria-label="Tipo de movimentação">
            <TabsTrigger value="expenses">Saídas</TabsTrigger>
            <TabsTrigger value="income">Entradas</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {chartData.length ? (
          <div className="grid items-center gap-4 md:grid-cols-[minmax(180px,0.8fr)_1.2fr]">
            <div className="relative">
              <ChartContainer
                config={chartConfig}
                className="mx-auto h-[220px] w-full max-w-[280px] aspect-auto"
                aria-label={`Gráfico de rosca de ${kind === "expenses" ? "saídas" : "entradas"} por categoria`}
              >
                <PieChart accessibilityLayer>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        hideLabel
                        nameKey="series"
                        valueFormatter={(value) =>
                          formatCurrency(Number(value))
                        }
                      />
                    }
                  />
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="series"
                    innerRadius={62}
                    outerRadius={92}
                    paddingAngle={2}
                    strokeWidth={2}
                  >
                    {chartData.map((item) => (
                      <Cell key={item.categoryId} fill={item.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-muted-foreground">
                  {kind === "expenses" ? "Saídas" : "Entradas"}
                </span>
                <span className="font-semibold tabular-nums">
                  {formatCurrency(total)}
                </span>
              </div>
            </div>
            <ul className="grid gap-2" aria-label="Valores por categoria">
              {chartData.map((item) => (
                <li
                  key={item.categoryId}
                  className="flex min-w-0 items-center justify-between gap-3 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="truncate">{item.categoryName}</span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {formatCurrency(item.value)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Ainda não há {kind === "expenses" ? "saídas" : "entradas"}{" "}
            realizadas neste mês.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
