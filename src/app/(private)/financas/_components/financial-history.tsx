"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
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

const historyChartConfig = {
  entradas: { label: "Entradas", color: "var(--status-success)" },
  saidas: { label: "Saídas", color: "var(--status-danger)" },
} satisfies ChartConfig;

type HistoryChartPoint = {
  fullMonth: string;
  entradas: number | null;
  saidas: number | null;
  resultado: number | null;
};

export function FinancialHistoryTooltip({
  active,
  payload,
}: TooltipProps<number, string>) {
  const point = payload?.[0]?.payload as HistoryChartPoint | undefined;
  if (!active || !point) return null;
  const month = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${point.fullMonth}-01T00:00:00Z`));
  const money = (value: number | null) =>
    value === null ? "Sem registro" : formatCurrency(value);
  return (
    <div className="grid min-w-40 gap-1.5 rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
      <p className="font-medium capitalize">{month}</p>
      <p>Entradas: {money(point.entradas)}</p>
      <p>Saídas: {money(point.saidas)}</p>
      <p className="border-t pt-1 font-semibold">
        Resultado do período: {money(point.resultado)}
      </p>
    </div>
  );
}

export function formatFinancialHistoryTick(month: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

export function FinancialHistory({
  months,
}: {
  months: FinancialHistoryMonth[];
}) {
  const reducedMotion = useReducedMotion();
  const chartData = months.map((item) => ({
    month: formatFinancialHistoryTick(item.month),
    fullMonth: item.month,
    entradas: item.realizedIncome === null ? null : Number(item.realizedIncome),
    saidas:
      item.realizedExpenses === null ? null : Number(item.realizedExpenses),
    resultado:
      item.recordedBalance === null ? null : Number(item.recordedBalance),
  }));
  const hasRecordedAmounts = chartData.some(
    (point) => point.entradas !== null || point.saidas !== null,
  );

  return (
    <section aria-labelledby="finance-history-title">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 id="finance-history-title" className="text-lg font-semibold">
            Histórico realizado
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Mostra entradas e saídas realizadas; previsões não entram neste
            histórico.
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
                <ChartTooltip content={<FinancialHistoryTooltip />} />
                <Bar
                  dataKey="entradas"
                  fill="var(--color-entradas)"
                  stroke="var(--color-entradas)"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={!reducedMotion}
                />
                <Bar
                  dataKey="saidas"
                  fill="var(--color-saidas)"
                  stroke="var(--color-saidas)"
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
      <div className="sr-only">
        <table>
          <caption>Valores mensais do histórico realizado</caption>
          <thead>
            <tr>
              <th>Mês</th>
              <th>Entradas</th>
              <th>Saídas</th>
              <th>Resultado do período</th>
            </tr>
          </thead>
          <tbody>
            {months.map((item) => (
              <tr key={item.month}>
                <th>{item.month}</th>
                <td>
                  {item.realizedIncome === null
                    ? "Sem registro"
                    : formatCurrency(Number(item.realizedIncome))}
                </td>
                <td>
                  {item.realizedExpenses === null
                    ? "Sem registro"
                    : formatCurrency(Number(item.realizedExpenses))}
                </td>
                <td>
                  {item.recordedBalance === null
                    ? "Sem registro"
                    : formatCurrency(Number(item.recordedBalance))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
