"use client";

import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer } from "@/components/ui/chart";
import { formatCurrency } from "@/lib/utils";

export type DistributionItem = {
  label: string;
  value: number;
  percentage: number;
};

const categoryColors = [
  "#2563eb",
  "#0891b2",
  "#059669",
  "#7c3aed",
  "#d97706",
  "#64748b",
];

function DistributionChart({
  title,
  items,
  emptyMessage,
  loading = false,
}: {
  title: string;
  items: DistributionItem[] | null;
  emptyMessage: string;
  loading?: boolean;
}) {
  const displayItems = items ?? [];
  const chartData = displayItems.map((item, index) => ({
    ...item,
    color: categoryColors[index % categoryColors.length],
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p role="status" className="py-5 text-sm text-muted-foreground">
            Carregando distribuição…
          </p>
        ) : items === null ? (
          <p role="status" className="py-5 text-sm text-muted-foreground">
            Não foi possível carregar esta distribuição.
          </p>
        ) : displayItems.length === 0 ? (
          <p className="py-5 text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ul
            className="space-y-2"
            aria-label={`${title}: valores e participação`}
          >
            {chartData.map((item) => (
              <li key={item.label} className="space-y-1">
                <div className="flex min-w-0 items-baseline justify-between gap-3 text-xs leading-4">
                  <span
                    className="min-w-0 truncate font-medium"
                    title={item.label}
                  >
                    {item.label}
                  </span>
                  <span className="shrink-0 text-right tabular-nums text-muted-foreground">
                    {formatCurrency(item.value)} ·{" "}
                    {item.percentage.toLocaleString("pt-BR", {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                    %
                  </span>
                </div>
                <ChartContainer
                  config={{
                    share: { label: item.label, color: item.color },
                  }}
                  className="h-2.5 w-full min-w-0 aspect-auto"
                  role="img"
                  aria-label={`${item.label}: ${formatCurrency(item.value)}, ${item.percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
                >
                  <BarChart
                    data={[item]}
                    layout="vertical"
                    margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                    accessibilityLayer
                  >
                    <XAxis type="number" domain={[0, 100]} hide />
                    <YAxis type="category" dataKey="label" hide />
                    <Bar
                      dataKey="percentage"
                      background={{ fill: "var(--muted)" }}
                      radius={[0, 4, 4, 0]}
                      maxBarSize={10}
                    >
                      <Cell fill={item.color} />
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function PortfolioDistributionCharts({
  institutionItems,
  classItems,
  unclassifiedValue,
  unclassifiedPercentage,
  loading,
}: {
  institutionItems: DistributionItem[];
  classItems: DistributionItem[] | null;
  unclassifiedValue: number | null;
  unclassifiedPercentage: number | null;
  loading: boolean;
}) {
  return (
    <section
      className="grid gap-4 lg:grid-cols-2"
      aria-label="Distribuição da carteira"
    >
      <DistributionChart
        title="Onde está · por instituição"
        items={institutionItems}
        emptyMessage="Ainda não há valores conhecidos para mostrar a distribuição."
      />
      <div className="space-y-3">
        <DistributionChart
          title="Como se distribui · por classe"
          items={classItems}
          emptyMessage="Não há valores classificados disponíveis."
          loading={loading}
        />
        {!loading &&
          classItems !== null &&
          unclassifiedValue !== null &&
          unclassifiedValue > 0 && (
            <p className="px-1 text-xs text-muted-foreground">
              {formatCurrency(unclassifiedValue)} (
              {(unclassifiedPercentage ?? 0).toLocaleString("pt-BR", {
                maximumFractionDigits: 1,
              })}
              %) sem classe informada.
            </p>
          )}
      </div>
    </section>
  );
}
