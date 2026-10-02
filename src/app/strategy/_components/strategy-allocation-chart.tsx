"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export const strategyClasses = [
  { id: "fixed_income", label: "Renda fixa", color: "#178357" },
  { id: "brazilian_equities", label: "Ações brasileiras", color: "#3268c8" },
  { id: "international_etfs", label: "ETFs internacionais", color: "#8155b8" },
  { id: "fiis", label: "FIIs", color: "#c36a24" },
] as const;

export type StrategyClassId = (typeof strategyClasses)[number]["id"];
export type StrategyPercentages = Record<StrategyClassId, number>;

export type StrategyCompositionRow = {
  name: string;
} & Record<StrategyClassId, number>;

const chartConfig = Object.fromEntries(
  strategyClasses.map(({ id, label, color }) => [id, { label, color }]),
) satisfies ChartConfig;

export function formatStrategyPercentage(value: unknown) {
  return `${Number(value).toFixed(2)}%`;
}

export function StrategyAllocationChart({
  data,
}: {
  data: StrategyCompositionRow[];
}) {
  return (
    <div
      aria-label="Comparação da composição percentual por classe"
      role="group"
    >
      <ChartContainer config={chartConfig} className="h-44 w-full sm:h-52">
        <BarChart
          accessibilityLayer
          data={data}
          layout="vertical"
          margin={{ left: 8, right: 12, top: 8, bottom: 0 }}
          barCategoryGap={18}
        >
          <CartesianGrid horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tickFormatter={(value: number) => `${value}%`}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            dataKey="name"
            type="category"
            width={82}
            tickLine={false}
            axisLine={false}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent formatter={formatStrategyPercentage} />
            }
          />
          {strategyClasses.map(({ id }) => (
            <Bar
              key={id}
              dataKey={id}
              stackId="composition"
              fill={`var(--color-${id})`}
            />
          ))}
        </BarChart>
      </ChartContainer>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        {strategyClasses.map(({ id, label, color }) => (
          <li key={id} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: color }}
            />
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
