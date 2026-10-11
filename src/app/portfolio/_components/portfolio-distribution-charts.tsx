"use client";

import { useReducedMotion } from "@/lib/use-reduced-motion";
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { portfolioAssetClassOptions } from "@/lib/portfolio-classification-options";
import { neutralAssetClassColor } from "@/lib/strategy-allocation";
import { formatCurrency } from "@/lib/utils";

export type DistributionItem = {
  label: string;
  value: number;
  percentage: number;
};

const categoryColors = [
  "var(--chart-category-1)",
  "var(--chart-category-2)",
  "var(--chart-category-3)",
  "var(--chart-category-4)",
  "var(--chart-category-5)",
  "var(--chart-category-6)",
] as const;

type PortfolioAssetClass = (typeof portfolioAssetClassOptions)[number];

const portfolioAssetClassColors: Record<PortfolioAssetClass, string> = {
  "Renda fixa": categoryColors[3],
  "Renda variável": categoryColors[0],
  Fundos: categoryColors[4],
  Criptoativos: categoryColors[1],
  Imóveis: categoryColors[2],
  Outros: categoryColors[5],
};

function getInstitutionColor(label: string) {
  let hash = 0;
  for (const character of label) {
    hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  }
  return categoryColors[hash % categoryColors.length];
}

function getDistributionColor(
  label: string,
  colorSource: "institution" | "asset-class",
) {
  if (colorSource === "institution") return getInstitutionColor(label);
  return (
    portfolioAssetClassColors[label as PortfolioAssetClass] ??
    neutralAssetClassColor
  );
}

function DistributionChart({
  title,
  items,
  emptyMessage,
  loading = false,
  colorSource,
}: {
  title: string;
  items: DistributionItem[] | null;
  emptyMessage: string;
  loading?: boolean;
  colorSource: "institution" | "asset-class";
}) {
  const reducedMotion = useReducedMotion();
  const displayItems = items ?? [];
  const chartData = displayItems.map((item) => ({
    ...item,
    color: getDistributionColor(item.label, colorSource),
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div
            role="status"
            aria-label={`Carregando ${title.toLowerCase()}`}
            aria-busy="true"
            className="space-y-4 py-2"
          >
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="space-y-2">
                <div className="flex justify-between gap-3">
                  <Skeleton className="h-3 w-32 max-w-[60%]" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-2.5 w-full" />
              </div>
            ))}
          </div>
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
                    {formatCurrency(item.value)}
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
                      isAnimationActive={
                        !reducedMotion && displayItems.length > 1
                      }
                      animationDuration={280}
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
        colorSource="institution"
      />
      <div className="space-y-3">
        <DistributionChart
          title="Como se distribui · por classe"
          items={classItems}
          emptyMessage="Não há valores classificados disponíveis."
          loading={loading}
          colorSource="asset-class"
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
