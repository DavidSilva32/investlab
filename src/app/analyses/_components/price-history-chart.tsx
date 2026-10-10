import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { StockAnalysis } from "./stock-analysis-types";

const failureMessages: Record<
  NonNullable<StockAnalysis["historyFailure"]>["reason"],
  string
> = {
  rate_limited: "O provedor limitou consultas recentes.",
  authentication: "A autenticação da fonte de cotações falhou.",
  timeout: "A consulta de histórico demorou mais que o esperado.",
  provider_error: "A fonte de cotações está temporariamente indisponível.",
  invalid_response: "A fonte retornou dados de histórico inválidos.",
};

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
  status = "available",
  failure,
  retrying = false,
  retryError = false,
  retryAfterSeconds = 0,
  onRetry,
}: {
  points: StockAnalysis["history"];
  status?: "available" | "empty" | "unavailable";
  failure?: StockAnalysis["historyFailure"];
  retrying?: boolean;
  retryError?: boolean;
  retryAfterSeconds?: number;
  onRetry?: () => void;
}) {
  if (points.length < 2)
    return (
      <div
        role={status === "unavailable" ? "status" : undefined}
        className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full ${status === "unavailable" ? "bg-status-warning/10 text-status-warning" : "bg-muted text-muted-foreground"}`}
          >
            <AlertCircle className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-foreground">
              {status === "unavailable"
                ? "Histórico temporariamente indisponível"
                : status === "empty"
                  ? "Sem cotações para este ativo ou período"
                  : "Histórico insuficiente para montar o gráfico"}
            </p>
            <p className="text-xs text-muted-foreground">
              {retryError
                ? "Não foi possível atualizar agora. Tente novamente."
                : status === "unavailable" && failure
                  ? failureMessages[failure.reason]
                  : status === "empty"
                    ? "A fonte não retornou preços de fechamento neste intervalo."
                    : "O gráfico precisa de pelo menos dois fechamentos observados."}
            </p>
          </div>
        </div>
        {status === "unavailable" && onRetry && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={retrying || retryAfterSeconds > 0}
            onClick={onRetry}
          >
            <RefreshCw
              className={`size-4 ${retrying ? "motion-safe:animate-spin" : ""}`}
              aria-hidden="true"
            />
            {retrying
              ? "Atualizando…"
              : retryAfterSeconds > 0
                ? `Aguarde ${retryAfterSeconds}s`
                : "Tentar novamente"}
          </Button>
        )}
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
