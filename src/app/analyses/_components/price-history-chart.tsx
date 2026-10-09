import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
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
  close: { label: "Fechamento", color: "var(--primary)" },
} satisfies ChartConfig;

export function PriceHistoryChart({
  points,
  unavailable = false,
}: {
  points: StockAnalysis["history"];
  unavailable?: boolean;
}) {
  if (points.length < 2)
    return (
      <div
        role={unavailable ? "status" : undefined}
        className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground"
      >
        {unavailable
          ? "Não foi possível carregar o histórico de cotações agora. Os preços desse período estão indisponíveis."
          : "Não há histórico suficiente para montar o gráfico neste intervalo."}
      </div>
    );

  return (
    <ChartContainer
      config={chartConfig}
      className="h-64 w-full aspect-auto"
      aria-label="Gráfico do histórico de preço de fechamento"
    >
      <AreaChart
        accessibilityLayer
        data={points}
        margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id="price-history-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
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
        <Area
          type="monotone"
          dataKey="close"
          stroke="var(--color-close)"
          strokeWidth={2}
          fill="url(#price-history-area)"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ChartContainer>
  );
}
