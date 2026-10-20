"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  Building2,
  ChevronDown,
  Globe2,
  Landmark,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { AssetLogo } from "@/components/asset-logo";
import {
  formatCurrencyCents,
  resolvePositionMoney,
} from "@/lib/portfolio-money";
import {
  getStrategyAssetClassColor,
  getStrategyAssetClassId,
  neutralAssetClassColor,
  strategyAssetClasses,
} from "@/lib/strategy-allocation";
import type { PortfolioPosition } from "@/app/(private)/portfolio/_components/portfolio-classification-list";

const classIcons = {
  fixed_income: ShieldCheck,
  brazilian_equities: BarChart3,
  international_etfs: Globe2,
  fiis: Building2,
} as const;

export function isSupportedAnalyzedEquity(position: PortfolioPosition) {
  const classId = getStrategyAssetClassId({
    product: position.product,
    assetClass: position.classification.assetClass,
    subClass: position.classification.subClass,
    geography: position.classification.geography,
  });
  const type = `${position.product} ${position.classification.subClass ?? ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

  return (
    classId === "brazilian_equities" &&
    !/\bbdrs?\b/.test(type) &&
    /\b(acao|acoes|ordinaria|preferencial)\b/.test(type)
  );
}

function getPositionValue(position: PortfolioPosition) {
  return position.canonicalValueCents !== null &&
    position.canonicalValueCents !== undefined &&
    /^-?\d+$/.test(position.canonicalValueCents)
    ? { cents: BigInt(position.canonicalValueCents) }
    : resolvePositionMoney(position);
}

function PortfolioLink({ label }: { label: string }) {
  return (
    <Button asChild type="button" variant="outline" size="sm">
      <Link href="/portfolio">
        {label}
        <ArrowUpRight className="ml-2 size-4" aria-hidden="true" />
      </Link>
    </Button>
  );
}

export function PortfolioPositions({
  positions,
  analysesByTicker,
  tickersNeedingInput = new Set<string>(),
}: {
  positions: PortfolioPosition[];
  analysesByTicker: ReadonlyMap<string, ReactNode>;
  tickersNeedingInput?: ReadonlySet<string>;
}) {
  type PositionGroup = {
    id: string;
    label: string;
    color: string;
    positions: PortfolioPosition[];
  };
  const groups = strategyAssetClasses.map((assetClass) => ({
    id: assetClass.id,
    label: assetClass.label,
    color: getStrategyAssetClassColor(assetClass.id),
    positions: positions.filter(
      (position) =>
        getStrategyAssetClassId({
          product: position.product,
          assetClass: position.classification.assetClass,
          subClass: position.classification.subClass,
          geography: position.classification.geography,
        }) === assetClass.id,
    ),
  })) as PositionGroup[];
  const broadClasses = new Map<string, PortfolioPosition[]>();
  const unclassified: PortfolioPosition[] = [];
  for (const position of positions) {
    const classId = getStrategyAssetClassId({
      product: position.product,
      assetClass: position.classification.assetClass,
      subClass: position.classification.subClass,
      geography: position.classification.geography,
    });
    if (classId !== null) continue;
    const broadClass = position.classification.assetClass?.trim();
    if (!broadClass) {
      unclassified.push(position);
      continue;
    }
    const categoryPositions = broadClasses.get(broadClass) ?? [];
    categoryPositions.push(position);
    broadClasses.set(broadClass, categoryPositions);
  }
  for (const [label, categoryPositions] of broadClasses) {
    groups.push({
      id: `category:${label}`,
      label,
      color: neutralAssetClassColor,
      positions: categoryPositions,
    });
  }
  if (unclassified.length) {
    groups.push({
      id: "unclassified",
      label: "Classe não identificada",
      color: neutralAssetClassColor,
      positions: unclassified,
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Análises por classe</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {groups
          .filter((group) => group.positions.length > 0)
          .map((group) => {
            const Icon =
              group.id in classIcons
                ? classIcons[group.id as keyof typeof classIcons]
                : Landmark;
            const knownValues = group.positions
              .map(getPositionValue)
              .filter((money) => money.cents !== null);
            const totalKnownCents = knownValues.reduce(
              (sum, money) => sum + money.cents!,
              0n,
            );
            const hasKnownValue = knownValues.length > 0;
            const equityPositions =
              group.id === "brazilian_equities"
                ? group.positions.filter(isSupportedAnalyzedEquity)
                : [];
            const isEquityClass = group.id === "brazilian_equities";

            return (
              <Collapsible
                key={group.id}
                defaultOpen={isEquityClass}
                className="overflow-hidden rounded-lg border"
              >
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto min-h-16 w-full justify-between gap-3 rounded-none px-3 py-3 text-left sm:px-4"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted"
                        style={{ color: group.color }}
                        aria-hidden="true"
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {group.label}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {group.positions.length}{" "}
                          {group.positions.length === 1
                            ? "posição"
                            : "posições"}
                          {isEquityClass && equityPositions.length > 0
                            ? ` · ${equityPositions.length} ${equityPositions.length === 1 ? "ação" : "ações"} para analisar`
                            : ""}
                        </span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 sm:gap-4">
                      <span className="text-right">
                        <span className="block text-sm font-semibold tabular-nums">
                          {hasKnownValue
                            ? formatCurrencyCents(totalKnownCents)
                            : "—"}
                        </span>
                        <span className="hidden text-xs text-muted-foreground sm:block">
                          valor conhecido
                        </span>
                      </span>
                      <ChevronDown
                        className="size-4 shrink-0 transition-transform duration-200 [[data-state=open]_&]:rotate-180"
                        aria-hidden="true"
                      />
                    </span>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-4 py-3">
                    <p className="max-w-2xl text-sm text-muted-foreground">
                      {group.id === "fixed_income"
                        ? "As aplicações de renda fixa ficam resumidas aqui. Consulte Carteira para ver cada título e movimentação."
                        : group.id === "brazilian_equities"
                          ? "Veja as referências por empresa e complete os dados que faltam quando necessário."
                          : group.id === "international_etfs"
                            ? "O valor da classe é acompanhado sem aplicar fórmulas de ações aos ETFs."
                            : group.id === "fiis"
                              ? "O valor da classe é acompanhado sem aplicar fórmulas de ações aos fundos imobiliários."
                              : "Consulte Carteira para revisar e classificar estas posições."}
                    </p>
                    {!isEquityClass && (
                      <PortfolioLink label="Ver carteira completa" />
                    )}
                  </div>
                  {isEquityClass &&
                    (equityPositions.length > 0 ? (
                      <ul className="divide-y border-t">
                        {equityPositions.map((position, index) => {
                          const ticker =
                            position.assetCode?.trim().toUpperCase() ?? "";
                          const details = analysesByTicker.get(ticker);
                          const needsInput = tickersNeedingInput.has(ticker);
                          const money = getPositionValue(position);
                          const name =
                            position.product || position.assetCode || "Ação";
                          const positionId = position.id || `equity-${index}`;

                          return (
                            <li key={positionId} className="px-3 py-3 sm:px-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <span className="flex min-w-0 items-center gap-3">
                                  {ticker ? (
                                    <AssetLogo
                                      ticker={ticker}
                                      name={name}
                                      size="sm"
                                    />
                                  ) : (
                                    <span
                                      className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                                      aria-hidden="true"
                                    >
                                      <Landmark className="size-4" />
                                    </span>
                                  )}
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium">
                                      {position.assetCode
                                        ? `${position.assetCode.trim()} · `
                                        : ""}
                                      {name}
                                    </span>
                                    <span className="block text-xs text-muted-foreground">
                                      {money.cents === null
                                        ? "Valor não informado"
                                        : formatCurrencyCents(money.cents)}
                                    </span>
                                  </span>
                                </span>
                                {details ? (
                                  <Collapsible>
                                    <CollapsibleTrigger asChild>
                                      <Button
                                        type="button"
                                        variant={
                                          needsInput ? "default" : "outline"
                                        }
                                        size="sm"
                                      >
                                        {needsInput
                                          ? "Completar dados"
                                          : "Ver análise da ação"}
                                        <ChevronDown
                                          className="ml-2 size-4 transition-transform [[data-state=open]_&]:rotate-180"
                                          aria-hidden="true"
                                        />
                                      </Button>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent className="pt-3">
                                      {details}
                                    </CollapsibleContent>
                                  </Collapsible>
                                ) : ticker ? (
                                  <Button asChild variant="outline" size="sm">
                                    <Link
                                      href={`/analises?ticker=${encodeURIComponent(ticker)}`}
                                    >
                                      Abrir análise
                                      <ArrowUpRight
                                        className="ml-2 size-4"
                                        aria-hidden="true"
                                      />
                                    </Link>
                                  </Button>
                                ) : null}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="border-t px-4 py-3 text-sm text-muted-foreground">
                        Nenhuma ação brasileira elegível foi confirmada nesta
                        classe.
                      </p>
                    ))}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
      </CardContent>
    </Card>
  );
}
