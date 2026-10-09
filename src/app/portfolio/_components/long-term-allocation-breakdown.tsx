"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  Globe2,
  Landmark,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyCents } from "@/lib/portfolio-money";
import {
  getStrategyAssetClassColor,
  neutralAssetClassColor,
  strategyAssetClasses,
  summarizeStrategyAllocation,
  type StrategyAllocationPosition,
} from "@/lib/strategy-allocation";

export type LongTermAllocationPosition = StrategyAllocationPosition & {
  positionCount: number;
  unvaluedPositions: number;
  referenceDate?: string | null;
  estimatedThrough?: string | null;
};

type Props = {
  positions: LongTermAllocationPosition[];
  missingPositionCount?: number;
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

function formatReferenceDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

export function getLongTermAllocationBreakdown(
  positions: LongTermAllocationPosition[],
) {
  const summary = summarizeStrategyAllocation(positions);
  const valuedPositions = positions.filter(
    (position) =>
      BigInt(position.knownValueCents ?? position.valueCents ?? "0") > 0n,
  );
  const valuationDates = [
    ...new Set(
      valuedPositions
        .map((position) => position.estimatedThrough ?? position.referenceDate)
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort();
  const undatedKnownPositionCount = valuedPositions
    .filter(
      (position) => !(position.estimatedThrough ?? position.referenceDate),
    )
    .reduce((total, position) => total + position.positionCount, 0);
  const unvaluedPositionCount = positions.reduce(
    (total, position) => total + position.unvaluedPositions,
    0,
  );
  const classes: Array<{
    id: string;
    label: string;
    knownValueCents: string;
    percentageBasisPoints: number;
    currentPercentage: number;
    color: string;
  }> = summary.classes
    .filter((assetClass) => BigInt(assetClass.knownValueCents) > 0n)
    .map((assetClass) => ({
      ...assetClass,
      color: getStrategyAssetClassColor(assetClass.id),
    }));
  const unclassifiedCents = BigInt(summary.unclassifiedKnownValueCents);
  if (unclassifiedCents > 0n) {
    classes.push({
      id: "unclassified",
      label: "Classe não identificada",
      knownValueCents: summary.unclassifiedKnownValueCents,
      percentageBasisPoints: summary.unclassifiedPercentageBasisPoints,
      currentPercentage: summary.unclassifiedPercentageBasisPoints / 100,
      color: neutralAssetClassColor,
    });
  }

  let angle = 0;
  const stops = classes.map((assetClass) => {
    const nextAngle = angle + (assetClass.percentageBasisPoints / 10000) * 360;
    const stop = `${assetClass.color} ${angle}deg ${nextAngle}deg`;
    angle = nextAngle;
    return stop;
  });

  return {
    classes,
    knownValueCents: summary.knownValueCents,
    unclassifiedKnownValueCents: summary.unclassifiedKnownValueCents,
    unclassifiedPositionCount: summary.unclassifiedPositionCount,
    unvaluedPositionCount,
    valuationDates,
    undatedKnownPositionCount,
    chartBackground: `conic-gradient(${stops.join(", ")})`,
  };
}

export function LongTermAllocationBreakdown({
  positions,
  missingPositionCount = 0,
}: Props) {
  const breakdown = getLongTermAllocationBreakdown(positions);
  const hasKnownValues = BigInt(breakdown.knownValueCents) > 0n;
  const incomplete =
    missingPositionCount > 0 ||
    breakdown.unvaluedPositionCount > 0 ||
    breakdown.unclassifiedPositionCount > 0;
  const valuationDateText =
    breakdown.valuationDates.length === 1 &&
    breakdown.undatedKnownPositionCount === 0
      ? `Valores em ${formatReferenceDate(breakdown.valuationDates[0]!)}.`
      : breakdown.valuationDates.length > 0
        ? `Datas conhecidas: ${breakdown.valuationDates
            .slice(0, 3)
            .map(formatReferenceDate)
            .join(
              ", ",
            )}${breakdown.valuationDates.length > 3 ? ` e mais ${breakdown.valuationDates.length - 3}` : ""}${breakdown.undatedKnownPositionCount > 0 ? `; ${breakdown.undatedKnownPositionCount} posição(ões) sem data.` : "."}`
        : "Data de referência indisponível para os valores conhecidos.";

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base">
            Composição atual do investimento de longo prazo
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Valores conhecidos por classe, sobre posições vinculadas.
          </p>
        </div>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="w-full shrink-0 sm:w-auto"
        >
          <Link href="/strategy">
            Comparar com a estratégia
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasKnownValues ? (
          <div className="grid gap-4 sm:grid-cols-[144px_minmax(0,1fr)] sm:items-center">
            <div
              aria-label={`Gráfico da composição atual do investimento de longo prazo: ${breakdown.classes
                .map(
                  (assetClass) =>
                    `${assetClass.label}, ${assetClass.currentPercentage.toFixed(2)} por cento`,
                )
                .join("; ")}`}
              className="relative mx-auto size-32 rounded-full sm:size-36"
              role="img"
              style={{ background: breakdown.chartBackground }}
            >
              <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-card text-center">
                <span className="text-xs text-muted-foreground">
                  Valor conhecido
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {formatCurrencyCents(breakdown.knownValueCents)}
                </span>
              </div>
            </div>
            <ul
              aria-label="Distribuição atual por classe de investimento"
              className="space-y-2"
            >
              {breakdown.classes.map((assetClass) => {
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
                        {assetClass.currentPercentage.toFixed(2)}%
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
          <CalendarDays
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0"
          />
          <span>{valuationDateText}</span>
        </p>
        {breakdown.valuationDates.length > 3 && (
          <details className="pl-5 text-xs text-muted-foreground">
            <summary className="w-fit cursor-pointer font-medium underline underline-offset-4">
              Ver todas as datas de referência
            </summary>
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {breakdown.valuationDates.map((value) => (
                <li key={value}>{formatReferenceDate(value)}</li>
              ))}
            </ul>
          </details>
        )}

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
                {breakdown.unvaluedPositionCount > 0 && (
                  <li>
                    {breakdown.unvaluedPositionCount} posição(ões) sem valor
                    conhecido foram excluídas dos percentuais.
                  </li>
                )}
                {missingPositionCount > 0 && (
                  <li>
                    {missingPositionCount} posição(ões) atribuída(s) não foram
                    encontradas e ficaram fora do cálculo.
                  </li>
                )}
                {breakdown.unclassifiedPositionCount > 0 && (
                  <li>
                    {BigInt(breakdown.unclassifiedKnownValueCents) > 0n
                      ? `O valor de ${formatCurrencyCents(breakdown.unclassifiedKnownValueCents)} em posições sem classe identificada aparece em “Classe não identificada”. `
                      : `${breakdown.unclassifiedPositionCount} posição(ões) não têm classe identificada. `}
                    Confira as classificações da carteira.
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
