"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { useReducedMotion } from "@/lib/use-reduced-motion";

export type FinancialHistoryMonth = {
  month: string;
  realizedIncome: string | null;
  realizedExpenses: string | null;
  recordedBalance: string | null;
};

const money = (value: string | null) =>
  value === null ? "Sem registro" : formatCurrency(Number(value));
const monthLabel = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T00:00:00Z`));
const historyChartConfig = {
  entradas: { label: "Entradas", color: "var(--chart-1)" },
  saidas: { label: "Saídas", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function formatFinancialHistoryTick(month: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

export function FinancialHistory({
  months,
  selectedMonth,
  explanation,
}: {
  months: FinancialHistoryMonth[];
  selectedMonth: string;
  explanation: string;
}) {
  const reducedMotion = useReducedMotion();
  const chartData = months.map((item) => ({
    month: formatFinancialHistoryTick(item.month),
    entradas: item.realizedIncome === null ? null : Number(item.realizedIncome),
    saidas:
      item.realizedExpenses === null ? null : Number(item.realizedExpenses),
  }));
  const hasRecordedAmounts = chartData.some(
    (point) => point.entradas !== null || point.saidas !== null,
  );

  return (
    <section aria-labelledby="finance-history-title">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 id="finance-history-title" className="text-lg font-semibold">
            Evolução registrada
          </h2>
          <p className="text-sm text-muted-foreground">
            O histórico usa somente registros salvos; meses sem dados não são
            tratados como zero.
          </p>
        </div>
      </div>
      {hasRecordedAmounts ? (
        <Card className="mb-4">
          <CardContent className="p-4 sm:p-6">
            <ChartContainer
              config={historyChartConfig}
              className="h-[240px] w-full aspect-auto"
              aria-label="Gráfico de entradas e saídas realizadas nos últimos 12 meses"
            >
              <BarChart
                accessibilityLayer
                data={chartData}
                margin={{ left: 8, right: 8 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tickFormatter={(value: number) =>
                    `R$ ${new Intl.NumberFormat("pt-BR", { notation: "compact" }).format(value)}`
                  }
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      valueFormatter={(value) => formatCurrency(Number(value))}
                    />
                  }
                />
                <Bar
                  dataKey="entradas"
                  fill="var(--color-entradas)"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={!reducedMotion}
                />
                <Bar
                  dataKey="saidas"
                  fill="var(--color-saidas)"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={!reducedMotion}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      ) : (
        <p className="mb-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          Ainda não há dados realizados para comparar no histórico.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {months.map((item) => (
          <Card
            key={item.month}
            className={item.month === selectedMonth ? "border-primary/50" : ""}
          >
            <CardContent className="p-4">
              <p className="text-xs font-medium capitalize text-muted-foreground">
                {monthLabel(item.month)}
              </p>
              <p className="mt-2 text-sm">
                Entradas{" "}
                <span className="float-right font-medium">
                  {money(item.realizedIncome)}
                </span>
              </p>
              <p className="mt-1 text-sm">
                Saídas{" "}
                <span className="float-right font-medium">
                  {money(item.realizedExpenses)}
                </span>
              </p>
              <p className="mt-3 border-t pt-2 text-sm">
                Saldo registrado{" "}
                <span className="float-right font-semibold">
                  {money(item.recordedBalance)}
                </span>
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{explanation}</p>
    </section>
  );
}
