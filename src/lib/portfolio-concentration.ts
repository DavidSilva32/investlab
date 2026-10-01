import {
  centsToNumber,
  resolvePositionMoney,
  sumMoneyCents,
} from "@/lib/portfolio-money";

export type PortfolioConcentrationPosition = {
  id: string;
  product: string;
  assetCode?: string | null;
  issuer?: string | null;

  referenceDate?: string | null;
  conversionDate?: string | null;
  estimatedThrough?: string | null;
  totalValue: string | null;
  estimatedValue?: number | null;
  estimatedValueCents?: string | null;
  canonicalValueCents?: string | null;
  classification: {
    assetClass: string | null;
    subClass: string | null;
    geography: string | null;
  };
};

export type ConcentrationDimension =
  "asset" | "assetClass" | "subClass" | "geography";

export type PortfolioConcentration = {
  totalValue: number;
  totalValueCents: string;
  valuedPositions: number;
  unvaluedPositions: number;
  classifiedValue: number;
  classifiedValueCents: string;
  unclassifiedValue: number;
  unclassifiedValueCents: string;
  classifiedPositions: number;
  unclassifiedPositions: number;
  classifiedPercentage: number;
  unclassifiedPercentage: number;
  largestShare: number;
  groups: Array<{
    label: string;
    value: number;
    percentage: number;
  }>;
  chartGroups: Array<{ label: string; value: number; percentage: number }>;
  referenceDates: string[];
};

const positionCents = (position: PortfolioConcentrationPosition) =>
  position.canonicalValueCents !== undefined
    ? position.canonicalValueCents === null
      ? null
      : BigInt(position.canonicalValueCents)
    : resolvePositionMoney(position).cents;

const unknownLabels: Record<ConcentrationDimension, string> = {
  asset: "Ativo não identificado",
  assetClass: "Classe não informada",
  subClass: "Subclasse não informada",
  geography: "Geografia não informada",
};

const normalizedIdentity = (value: string) =>
  value.trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");

function getGroup(
  position: PortfolioConcentrationPosition,
  dimension: ConcentrationDimension,
) {
  if (dimension === "asset") {
    const code = position.assetCode?.trim();
    const product = position.product.trim();
    if (code) return { key: `code:${normalizedIdentity(code)}`, label: code };
    if (product) {
      const issuer = position.issuer?.trim();
      const identity = [product, issuer].filter(Boolean).join(" · ");
      return { key: `name:${normalizedIdentity(identity)}`, label: identity };
    }
    return { key: "unknown", label: unknownLabels.asset };
  }

  const value = position.classification[dimension];
  return value?.trim()
    ? { key: normalizedIdentity(value), label: value.trim() }
    : { key: "unknown", label: unknownLabels[dimension] };
}

export function getPortfolioConcentration(
  positions: PortfolioConcentrationPosition[],
  dimension: ConcentrationDimension,
): PortfolioConcentration {
  const groups = new Map<string, { label: string; cents: bigint }>();
  const dates = new Set<string>();
  let valuedPositions = 0;
  let classifiedCents = 0n;
  let classifiedPositions = 0;

  for (const position of positions) {
    const cents = positionCents(position);
    if (cents === null) continue;

    valuedPositions += 1;
    const group = getGroup(position, dimension);
    const current = groups.get(group.key);
    groups.set(group.key, {
      label: group.label,
      cents: (current?.cents ?? 0n) + cents,
    });
    if (group.key !== "unknown") {
      classifiedCents += cents;
      classifiedPositions += 1;
    }
    const valueDate =
      position.estimatedValueCents != null || position.estimatedValue != null
        ? (position.estimatedThrough ?? position.referenceDate)
        : position.referenceDate;
    if (valueDate) dates.add(valueDate);
    if (position.conversionDate) dates.add(position.conversionDate);
  }

  const sortedGroups = [...groups.values()].sort(
    (left, right) =>
      (left.cents === right.cents ? 0 : left.cents > right.cents ? -1 : 1) ||
      left.label.localeCompare(right.label),
  );
  const totalCents = sumMoneyCents(
    [...groups.values()].map((group) => group.cents),
  );
  const totalValue = centsToNumber(totalCents)!;
  const classifiedValue = centsToNumber(classifiedCents)!;
  const unclassifiedCents = totalCents - classifiedCents;
  const unclassifiedValue = centsToNumber(unclassifiedCents)!;
  const denominator = totalCents > 0n ? totalCents : 0n;

  const formattedGroups = sortedGroups.map((group) => ({
    label: group.label,
    value: centsToNumber(group.cents)!,
    percentage:
      denominator > 0n ? (Number(group.cents) / Number(denominator)) * 100 : 0,
  }));
  const chartGroups =
    formattedGroups.length > 6
      ? [
          ...formattedGroups.slice(0, 5),
          {
            label: "Demais classes",
            value: centsToNumber(
              sortedGroups
                .slice(5)
                .reduce((total, group) => total + group.cents, 0n),
            )!,
            percentage:
              denominator > 0n
                ? (Number(
                    sortedGroups
                      .slice(5)
                      .reduce((total, group) => total + group.cents, 0n),
                  ) /
                    Number(denominator)) *
                  100
                : 0,
          },
        ]
      : formattedGroups;

  return {
    totalValue,
    totalValueCents: totalCents.toString(),
    valuedPositions,
    unvaluedPositions: positions.length - valuedPositions,
    classifiedValue,
    classifiedValueCents: classifiedCents.toString(),
    unclassifiedValue,
    unclassifiedValueCents: unclassifiedCents.toString(),
    classifiedPositions,
    unclassifiedPositions: valuedPositions - classifiedPositions,
    classifiedPercentage:
      denominator > 0n
        ? (Number(classifiedCents) / Number(denominator)) * 100
        : 0,
    unclassifiedPercentage:
      denominator > 0n
        ? (Number(unclassifiedCents) / Number(denominator)) * 100
        : 0,
    largestShare:
      denominator > 0n && sortedGroups.length > 0
        ? (Number(sortedGroups[0].cents) / Number(denominator)) * 100
        : 0,
    groups: formattedGroups,
    chartGroups,
    referenceDates: [...dates].sort(),
  };
}
