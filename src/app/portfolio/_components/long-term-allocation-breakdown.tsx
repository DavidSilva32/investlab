"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
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
  getStrategyAssetClassId,
  neutralAssetClassColor,
  strategyAssetClasses,
} from "@/lib/strategy-allocation";

export type LongTermAllocationPosition = {
  product: string;
  assetClass: string | null;
  geography?: string | null;
  positionCount: number;
  valueCents?: string | null;
  knownValueCents?: string | null;
  unvaluedPositions: number;
};

type Props = {
  positions: LongTermAllocationPosition[];
};

const assetClassIcons: Record<string, LucideIcon> = {
  fixed_income: ShieldCheck,
  brazilian_equities: BarChart3,
  international_etfs: Globe2,
  fiis: Building2,
  other: Landmark,
};

export function getLongTermAllocationBreakdown(
  positions: LongTermAllocationPosition[],
) {
  const totals = new Map<string, bigint>();
  let knownTotal = 0n;
  let unvaluedPositions = 0;

  for (const position of positions) {
    const knownCents = BigInt(
      position.knownValueCents ?? position.valueCents ?? "0",
    );
    const id =
      getStrategyAssetClassId({
        ...position,
        geography: position.geography ?? null,
      }) ?? "other";
    totals.set(id, (totals.get(id) ?? 0n) + knownCents);
    knownTotal += knownCents;
    unvaluedPositions += position.unvaluedPositions;
  }

  const classes = [
    ...strategyAssetClasses.map(({ id, label }) => ({
      id,
      label,
      valueCents: (totals.get(id) ?? 0n).toString(),
      color: getStrategyAssetClassColor(id),
    })),
    ...(totals.has("other")
      ? [
          {
            id: "other",
            label: "Outras posições",
            valueCents: totals.get("other")!.toString(),
            color: neutralAssetClassColor,
          },
        ]
      : []),
  ]
    .map((assetClass) => ({
      ...assetClass,
      percentage:
        knownTotal > 0n
          ? (Number(BigInt(assetClass.valueCents)) / Number(knownTotal)) * 100
          : 0,
    }))
    .filter((assetClass) => BigInt(assetClass.valueCents) > 0n);

  let angle = 0;
  const stops = classes.map((assetClass) => {
    const nextAngle = angle + assetClass.percentage * 3.6;
    const stop = `${assetClass.color} ${angle}deg ${nextAngle}deg`;
    angle = nextAngle;
    return stop;
  });

  return {
    classes,
    knownTotalCents: knownTotal.toString(),
    unvaluedPositions,
    chartBackground: `conic-gradient(${stops.join(", ")})`,
  };
}

export function LongTermAllocationBreakdown({ positions }: Props) {
  const breakdown = getLongTermAllocationBreakdown(positions);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base">
            Composição do investimento de longo prazo
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Veja como seus ativos se dividem por classe.
          </p>
        </div>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="w-full sm:w-auto"
        >
          <Link href="/strategy">
            Ver estratégia e próximo aporte
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
        {breakdown.classes.length > 0 ? (
          <>
            <div
              aria-label="Gráfico da composição do investimento de longo prazo"
              className="relative mx-auto size-36 rounded-full"
              role="img"
              style={{ background: breakdown.chartBackground }}
            >
              <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-card text-center">
                <span className="text-xs text-muted-foreground">Total</span>
                <span className="text-sm font-semibold tabular-nums">
                  {formatCurrencyCents(breakdown.knownTotalCents)}
                </span>
              </div>
            </div>
            <ul
              aria-label="Valores conhecidos por classe de investimento"
              className="space-y-2.5"
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
                        {formatCurrencyCents(assetClass.valueCents)}
                      </span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {new Intl.NumberFormat("pt-BR", {
                          maximumFractionDigits: 1,
                        }).format(assetClass.percentage)}
                        %
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground sm:col-span-2">
            Ainda não há valores conhecidos em posições de longo prazo.
          </p>
        )}
        {breakdown.unvaluedPositions > 0 && (
          <p className="text-xs text-muted-foreground sm:col-span-2">
            {breakdown.unvaluedPositions} posição(ões) sem valor atual não
            entram no gráfico.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
