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
import {
  getStrategyAssetClassColor,
  strategyAssetClasses,
  type StrategyAssetClassId,
} from "@/lib/strategy-allocation";

export type StrategyCompositionRow = {
  name: string;
} & Record<StrategyAssetClassId, number>;

const chartConfig = Object.fromEntries(
  strategyAssetClasses.map(({ id, label }) => [
    id,
    { label, color: getStrategyAssetClassColor(id) },
  ]),
) satisfies ChartConfig;

export function formatStrategyPercentage(value: unknown) {
  return `${Number(value).toFixed(2).replace(".", ",")}%`;
}

export function shouldRenderStrategyPercentageLabel(
  value: unknown,
  segmentWidth: unknown,
) {
  const percentage = Number(value);
  const width = Number(segmentWidth);
  if (
    !Number.isFinite(percentage) ||
    percentage <= 0 ||
    !Number.isFinite(width)
  )
    return false;

  const label = `${percentage.toString().replace(".", ",")}%`;
  const estimatedTextWidth = label.length * 7.2;
  const horizontalPadding = 8;
  return width >= estimatedTextWidth + horizontalPadding;
}

export function StrategyTooltipEntry({
  value,
  name,
}: {
  value: unknown;
  name: string;
}) {
  const assetClass = strategyAssetClasses.find((item) => item.id === name);
  if (!assetClass) return <span>{formatStrategyPercentage(value)}</span>;
  return (
    <span className="flex w-full items-center gap-2">
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: getStrategyAssetClassColor(assetClass.id) }}
      />
      <span className="text-foreground">{assetClass.label}</span>
      <span
        className="ml-auto font-mono font-semibold tabular-nums"
        style={{ color: getStrategyAssetClassColor(assetClass.id) }}
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
          {strategyAssetClasses.map(({ id }) => (
            <Bar
              key={id}
              dataKey={id}
              stackId="composition"
              fill={`var(--color-${id})`}
              isAnimationActive={false}
            >
              <LabelList
                dataKey={id}
                content={({ value, viewBox }) => {
                  if (
                    !viewBox ||
                    !("x" in viewBox) ||
                    !("y" in viewBox) ||
                    !("width" in viewBox) ||
                    !("height" in viewBox)
                  ) {
                    return null;
                  }

                  const x = viewBox?.x;
                  const y = viewBox?.y;
                  const width = viewBox?.width;
                  const height = viewBox?.height;
                  if (
                    !shouldRenderStrategyPercentageLabel(value, width) ||
                    typeof x !== "number" ||
                    typeof y !== "number" ||
                    typeof width !== "number" ||
                    typeof height !== "number"
                  ) {
                    return null;
                  }

                  return (
                    <text
                      x={x + width / 2}
                      y={y + height / 2}
                      dy="0.35em"
                      textAnchor="middle"
                      fill="#fff"
                      stroke="rgba(0, 0, 0, 0.55)"
                      strokeWidth={2}
                      fontSize={12}
                      fontWeight={700}
                      style={{ paintOrder: "stroke" }}
                    >
                      {`${Number(value).toString().replace(".", ",")}%`}
                    </text>
                  );
                }}
              />
            </Bar>
          ))}
        </BarChart>
      </ChartContainer>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        {strategyAssetClasses.map(({ id, label }) => (
          <li key={id} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: getStrategyAssetClassColor(id) }}
            />
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
