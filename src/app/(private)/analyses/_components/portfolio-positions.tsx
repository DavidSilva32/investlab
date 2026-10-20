"use client";

import type { ReactNode } from "react";
import {
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

export function PortfolioPositions({
  positions,
  analysesByTicker,
}: {
  positions: PortfolioPosition[];
  analysesByTicker: ReadonlyMap<string, ReactNode>;
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
  const unclassified = positions.filter(
    (position) =>
      getStrategyAssetClassId({
        product: position.product,
        assetClass: position.classification.assetClass,
        subClass: position.classification.subClass,
        geography: position.classification.geography,
      }) === null,
  );
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
        <CardTitle className="text-base">Ativos da carteira</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {groups
          .filter((group) => group.positions.length > 0)
          .map((group) => (
            <Collapsible key={group.id} defaultOpen>
              <section className="rounded-lg border">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-between gap-3 px-3 py-3 text-left"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {(() => {
                        const Icon =
                          group.id in classIcons
                            ? classIcons[group.id as keyof typeof classIcons]
                            : Landmark;
                        return (
                          <Icon
                            className="size-4 shrink-0"
                            style={{ color: group.color }}
                            aria-hidden="true"
                          />
                        );
                      })()}
                      <span className="font-medium">{group.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {group.positions.length}
                      </span>
                    </span>
                    <ChevronDown
                      className="size-4 shrink-0 transition-transform duration-200 [[data-state=open]_&]:rotate-180"
                      aria-hidden="true"
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="divide-y border-t">
                    {group.positions.map((position, index) => {
                      const ticker =
                        position.assetCode?.trim().toUpperCase() ?? "";
                      const details = isSupportedAnalyzedEquity(position)
                        ? analysesByTicker.get(ticker)
                        : undefined;
                      const money =
                        position.canonicalValueCents !== null &&
                        position.canonicalValueCents !== undefined &&
                        /^-?\d+$/.test(position.canonicalValueCents)
                          ? { cents: BigInt(position.canonicalValueCents) }
                          : resolvePositionMoney(position);
                      const identity =
                        position.product || position.assetCode || "Ativo";
                      const positionId = position.id || `${group.id}-${index}`;
                      return (
                        <li key={positionId} className="px-3 py-3">
                          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              {ticker ? (
                                <AssetLogo
                                  ticker={ticker}
                                  name={identity}
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
                                  {identity}
                                </span>
                                {position.institution && (
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {position.institution}
                                  </span>
                                )}
                              </span>
                            </div>
                            <span className="text-right text-sm font-medium tabular-nums">
                              {money.cents === null
                                ? "Valor não informado"
                                : formatCurrencyCents(money.cents)}
                            </span>
                          </div>
                          {details && (
                            <Collapsible>
                              <div className="mt-2 border-t pt-1">
                                <CollapsibleTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-auto w-full justify-between px-1 py-2 text-left text-sm"
                                  >
                                    <span>Ver análise da ação</span>
                                    <ChevronDown
                                      className="size-4 shrink-0 transition-transform duration-200 [[data-state=open]_&]:rotate-180"
                                      aria-hidden="true"
                                    />
                                  </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="pt-2">
                                  {details}
                                </CollapsibleContent>
                              </div>
                            </Collapsible>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </CollapsibleContent>
              </section>
            </Collapsible>
          ))}
      </CardContent>
    </Card>
  );
}
