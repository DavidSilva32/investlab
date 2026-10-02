"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { strategyAssetClassColorById } from "@/lib/portfolio-asset-class-colors";

export const strategyClasses = [
  {
    id: "fixed_income",
    label: "Renda fixa",
    color: strategyAssetClassColorById.fixed_income,
  },
  {
    id: "brazilian_equities",
    label: "Ações brasileiras",
    color: strategyAssetClassColorById.brazilian_equities,
  },
  {
    id: "international_etfs",
    label: "ETFs internacionais",
    color: strategyAssetClassColorById.international_etfs,
  },
  { id: "fiis", label: "FIIs", color: strategyAssetClassColorById.fiis },
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
  return `${Number(value).toFixed(2).replace(".", ",")}%`;
}

export function StrategyTooltipEntry({
  value,
  name,
}: {
  value: unknown;
  name: string;
}) {
  const assetClass = strategyClasses.find((item) => item.id === name);
  if (!assetClass) return <span>{formatStrategyPercentage(value)}</span>;
  return (
    <span className="flex w-full items-center gap-2">
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: assetClass.color }}
      />
      <span className="text-foreground">{assetClass.label}</span>
      <span
        className="ml-auto font-mono font-semibold tabular-nums"
        style={{ color: assetClass.color }}
      >
        {formatStrategyPercentage(value)}
      </span>
    </span>
  );
}

export function formatStrategyTooltip(value: unknown, name: unknown) {
  return <StrategyTooltipEntry value={value} name={String(name)} />;
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
      <ChartContainer
        config={chartConfig}
        className="h-36 w-full sm:h-44 lg:h-48"
      >
        <BarChart
          accessibilityLayer
          data={data}
          layout="vertical"
          margin={{ left: 8, right: 12, top: 8, bottom: 0 }}
          barCategoryGap={8}
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
              <ChartTooltipContent
                hideLabel
                formatter={formatStrategyTooltip}
              />
            }
          />
          {strategyClasses.map(({ id }) => (
            <Bar
              key={id}
              dataKey={id}
              stackId="composition"
              fill={`var(--color-${id})`}
              isAnimationActive={false}
            >
              <LabelList
                dataKey={id}
                position="inside"
                fill="#fff"
                stroke="rgba(0, 0, 0, 0.55)"
                strokeWidth={2}
                fontSize={12}
                fontWeight={700}
                style={{ paintOrder: "stroke" }}
                formatter={(value: number | string) => {
                  const percentage = Number(value);
                  return percentage >= 12
                    ? `${percentage.toString().replace(".", ",")}%`
                    : "";
                }}
              />
            </Bar>
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
