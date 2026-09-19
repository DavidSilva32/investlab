import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { StockAnalysis } from "./stock-analysis-types";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
const monthLabel = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
const chartConfig = {
  close: { label: "Fechamento", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function PriceHistoryChart({
  points,
}: {
  points: StockAnalysis["history"];
}) {
  if (points.length < 2)
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        Não há histórico suficiente para montar o gráfico neste intervalo.
      </div>
    );

  return (
    <ChartContainer
      config={chartConfig}
      className="h-64 w-full aspect-auto"
      aria-label="Gráfico do histórico de preço de fechamento"
    >
      <LineChart
        accessibilityLayer
        data={points}
        margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          minTickGap={32}
          tickFormatter={monthLabel}
        />
        <YAxis
          dataKey="close"
          tickLine={false}
          axisLine={false}
          width={68}
          tickFormatter={(value: number) => money.format(value)}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(value) =>
                typeof value === "string" ? dateLabel(value) : ""
              }
              formatter={(value) => money.format(Number(value))}
            />
          }
        />
        <Line
          type="monotone"
          dataKey="close"
          stroke="var(--color-close)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ChartContainer>
  );
}
