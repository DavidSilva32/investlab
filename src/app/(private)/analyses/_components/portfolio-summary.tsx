import {
  BarChart3,
  Building2,
  Globe2,
  Landmark,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type SummaryGroup = {
  id: string;
  label: string;
  count: number;
  valueCents: bigint;
  knownValueCount: number;
  color: string;
  percentage: number | null;
};

export function getPortfolioSummary(positions: PortfolioPosition[]) {
  const groups = new Map<string, SummaryGroup>();
  for (const assetClass of strategyAssetClasses) {
    groups.set(assetClass.id, {
      id: assetClass.id,
      label: assetClass.label,
      count: 0,
      valueCents: 0n,
      knownValueCount: 0,
      color: getStrategyAssetClassColor(assetClass.id),
      percentage: null,
    });
  }

  let knownValueCents = 0n;
  let knownValueCount = 0;
  let unvaluedCount = 0;
  for (const position of positions) {
    const money =
      position.canonicalValueCents !== null &&
      position.canonicalValueCents !== undefined &&
      /^-?\d+$/.test(position.canonicalValueCents)
        ? { cents: BigInt(position.canonicalValueCents) }
        : resolvePositionMoney(position);
    const id = getStrategyAssetClassId({
      product: position.product,
      assetClass: position.classification.assetClass,
      subClass: position.classification.subClass,
      geography: position.classification.geography,
    });
    const broadClass = position.classification.assetClass?.trim();
    const groupId =
      id ?? (broadClass ? `category:${broadClass}` : "unclassified");
    const group = groups.get(groupId) ?? {
      id: groupId,
      label: broadClass || "Classe não identificada",
      count: 0,
      valueCents: 0n,
      knownValueCount: 0,
      color: neutralAssetClassColor,
      percentage: null,
    };
    group.count += 1;
    if (money.cents === null) unvaluedCount += 1;
    else {
      group.valueCents += money.cents;
      group.knownValueCount += 1;
      knownValueCents += money.cents;
      knownValueCount += 1;
    }
    groups.set(groupId, group);
  }

  for (const group of groups.values()) {
    group.percentage =
      knownValueCents > 0n && group.knownValueCount > 0
        ? Number(
            (group.valueCents * 10000n + knownValueCents / 2n) /
              knownValueCents,
          ) / 100
        : null;
  }

  return {
    count: positions.length,
    knownValueCents,
    knownValueCount,
    unvaluedCount,
    groups: [...groups.values()].filter((group) => group.count > 0),
  };
}

export function PortfolioSummary({
  positions,
}: {
  positions: PortfolioPosition[];
}) {
  const summary = getPortfolioSummary(positions);
  const hasKnownValue = summary.knownValueCount > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Patrimônio acompanhado</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Valor conhecido</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {hasKnownValue
                ? formatCurrencyCents(summary.knownValueCents)
                : "—"}
            </p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Posições</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {summary.count}
            </p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Sem valor informado</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {summary.unvaluedCount}
            </p>
          </div>
        </div>
        <ul
          aria-label="Distribuição do valor conhecido por classe"
          className="space-y-3"
        >
          {summary.groups.map((group) => {
            const Icon =
              group.id in classIcons
                ? classIcons[group.id as keyof typeof classIcons]
                : Landmark;
            return (
              <li key={group.id} className="space-y-1.5">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon
                      className="size-4 shrink-0"
                      style={{ color: group.color }}
                      aria-hidden="true"
                    />
                    <span className="truncate text-sm">{group.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {group.count} {group.count === 1 ? "posição" : "posições"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-sm font-medium tabular-nums">
                    {group.knownValueCount === 0
                      ? "—"
                      : formatCurrencyCents(group.valueCents)}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {group.percentage === null
                        ? "participação —"
                        : `${group.percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
                    </span>
                  </span>
                </div>
                {group.percentage !== null &&
                  Number.isFinite(group.percentage) &&
                  group.percentage >= 0 &&
                  group.percentage <= 100 && (
                    <div
                      role="meter"
                      aria-label={`Participação de ${group.label} no valor conhecido`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={group.percentage}
                      className="h-1.5 overflow-hidden rounded-full bg-muted"
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${group.percentage}%`,
                          backgroundColor: group.color,
                        }}
                      />
                    </div>
                  )}
              </li>
            );
          })}
        </ul>
        {summary.unvaluedCount > 0 && (
          <p className="text-xs text-muted-foreground">
            O total considera apenas valores conhecidos; posições sem valor
            informado ficam fora da soma.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
