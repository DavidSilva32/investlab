"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  Globe2,
  Landmark,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Cell, Pie, PieChart } from "recharts";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatCurrencyCents } from "@/lib/portfolio-money";
import { formatCurrency } from "@/lib/utils";
import {
  getStrategyAssetClassColor,
  neutralAssetClassColor,
  strategyAssetClasses,
  summarizeStrategyAllocation,
  type StrategyAllocationPosition,
} from "@/lib/strategy-allocation";

export type DashboardLongTermPosition = StrategyAllocationPosition & {
  positionCount: number;
  unvaluedPositions: number;
  referenceDate?: string | null;
  estimatedThrough?: string | null;
  objectivePurpose?: string | null;
};

const assetClassIcons: Record<string, LucideIcon> = {
  fixed_income: ShieldCheck,
  brazilian_equities: BarChart3,
  international_etfs: Globe2,
  fiis: Building2,
  unclassified: Landmark,
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});
const percentFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});
type AllocationClass = {
  id: string;
  label: string;
  knownValueCents: string;
  percentageBasisPoints: number;
  currentPercentage: number;
  color: string;
};

function formatReferenceDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

export function DashboardLongTermAllocation({
  positions,
  missingPositionCount,
  onBack,
}: {
  positions: DashboardLongTermPosition[];
  missingPositionCount: number;
  onBack: () => void;
}) {
  const summary = summarizeStrategyAllocation(positions);
  const knownValueCents = BigInt(summary.knownValueCents);
  const classes: AllocationClass[] = summary.classes
    .filter((assetClass) => BigInt(assetClass.knownValueCents) > 0n)
    .map((assetClass) => ({
      ...assetClass,
      color: getStrategyAssetClassColor(assetClass.id),
    }));
  if (BigInt(summary.unclassifiedKnownValueCents) > 0n) {
    classes.push({
      id: "unclassified",
      label: "Classe não identificada",
      knownValueCents: summary.unclassifiedKnownValueCents,
      percentageBasisPoints: summary.unclassifiedPercentageBasisPoints,
      currentPercentage: summary.unclassifiedPercentageBasisPoints / 100,
      color: neutralAssetClassColor,
    });
  }

  const valuationDates = [
    ...new Set(
      positions
        .filter(
          (position) =>
            BigInt(position.knownValueCents ?? position.valueCents ?? "0") > 0n,
        )
        .map((position) => position.estimatedThrough ?? position.referenceDate)
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort();
  const undatedPositionCount = positions
    .filter(
      (position) =>
        BigInt(position.knownValueCents ?? position.valueCents ?? "0") > 0n &&
        !(position.estimatedThrough ?? position.referenceDate),
    )
    .reduce((total, position) => total + position.positionCount, 0);
  const unvaluedPositionCount = positions.reduce(
    (total, position) => total + position.unvaluedPositions,
    0,
  );
  const chartConfig = Object.fromEntries(
    classes.map(({ id, label, color }) => [id, { label, color }]),
  ) satisfies ChartConfig;
  const chartData = classes.map((assetClass) => ({
    ...assetClass,
    value: Number(BigInt(assetClass.knownValueCents)) / 100,
  }));
  const valuationDateNote =
    valuationDates.length === 1 && undatedPositionCount === 0
      ? `Valores em ${formatReferenceDate(valuationDates[0]!)}.`
      : valuationDates.length > 0
        ? `Valores com datas de referência diferentes.${undatedPositionCount > 0 ? ` ${undatedPositionCount} posição(ões) sem data.` : ""}`
        : "Data de referência indisponível para valores conhecidos.";
  const incomplete =
    missingPositionCount > 0 ||
    unvaluedPositionCount > 0 ||
    summary.unclassifiedPositionCount > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          Voltar aos destinos
        </Button>
        <Button asChild variant="outline" size="sm" className="ml-auto">
          <Link href="/estrategia">
            Comparar com a estratégia
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      </div>
      {knownValueCents > 0n ? (
        <div className="grid items-center gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
          <div className="relative mx-auto w-full max-w-48">
            <ChartContainer
              config={chartConfig}
              className="mx-auto h-40 w-full max-w-48"
              role="img"
              aria-label={`Distribuição do investimento de longo prazo por classe: ${classes
                .map(
                  (assetClass) =>
                    `${assetClass.label}, ${percentFormatter.format(assetClass.currentPercentage)}%`,
                )
                .join("; ")}`}
            >
              <PieChart>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => formatCurrency(Number(value))}
                    />
                  }
                />
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={42}
                  outerRadius={65}
                  strokeWidth={3}
                  isAnimationActive={false}
                >
                  {chartData.map((assetClass) => (
                    <Cell
                      key={assetClass.id}
                      fill={`var(--color-${assetClass.id})`}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xs text-muted-foreground">
                Total conhecido
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {formatCurrencyCents(summary.knownValueCents)}
              </span>
            </div>
          </div>
          <ul
            aria-label="Distribuição atual por classe de investimento"
            className="space-y-2"
          >
            {classes.map((assetClass) => {
              const AssetIcon = assetClassIcons[assetClass.id];
              return (
                <li
                  key={assetClass.id}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg border"
                      style={{ color: assetClass.color }}
                    >
                      <AssetIcon className="size-4" />
                    </span>
                    <span className="text-sm">{assetClass.label}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-medium tabular-nums">
                      {formatCurrencyCents(assetClass.knownValueCents)}
                    </span>
                    <span className="block text-sm font-semibold text-muted-foreground tabular-nums">
                      {percentFormatter.format(assetClass.currentPercentage)}%
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Ainda não há valores conhecidos nas posições de longo prazo.
        </p>
      )}
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <CalendarDays aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        <span>{valuationDateNote}</span>
      </p>
      {incomplete && (
        <div
          className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs leading-relaxed"
          role="status"
        >
          <AlertCircle
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
          />
          <div>
            <p className="font-medium">Composição parcial</p>
            <ul className="mt-1 list-inside list-disc text-muted-foreground">
              {unvaluedPositionCount > 0 && (
                <li>
                  {unvaluedPositionCount} posição(ões) sem valor conhecido foram
                  excluídas dos percentuais.
                </li>
              )}
              {missingPositionCount > 0 && (
                <li>
                  {missingPositionCount} posição(ões) atribuída(s) não foram
                  encontradas e ficaram fora do cálculo.
                </li>
              )}
              {summary.unclassifiedPositionCount > 0 && (
                <li>
                  {BigInt(summary.unclassifiedKnownValueCents) > 0n
                    ? `O valor de ${formatCurrencyCents(summary.unclassifiedKnownValueCents)} em posições sem classe identificada aparece em “Classe não identificada”. `
                    : `${summary.unclassifiedPositionCount} posição(ões) não têm classe identificada. `}
                  Confira as classificações da carteira.
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
