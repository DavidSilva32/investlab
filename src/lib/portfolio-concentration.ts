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
  valuedPositions: number;
  unvaluedPositions: number;
  classifiedValue: number;
  unclassifiedValue: number;
  classifiedPositions: number;
  unclassifiedPositions: number;
  largestShare: number;
  groups: Array<{
    label: string;
    value: number;
    percentage: number;
  }>;
  referenceDates: string[];
};

const positionValue = (position: PortfolioConcentrationPosition) => {
  if (
    position.estimatedValue !== undefined &&
    position.estimatedValue !== null &&
    Number.isFinite(position.estimatedValue)
  ) {
    return position.estimatedValue;
  }
  if (position.totalValue === null) return null;
  const value = Number(position.totalValue);
  return Number.isFinite(value) ? value : null;
};

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
  const groups = new Map<string, { label: string; value: number }>();
  const dates = new Set<string>();
  let totalValue = 0;
  let valuedPositions = 0;
  let classifiedValue = 0;
  let classifiedPositions = 0;

  for (const position of positions) {
    const value = positionValue(position);
    if (value === null) continue;

    totalValue += value;
    valuedPositions += 1;
    const group = getGroup(position, dimension);
    const current = groups.get(group.key);
    groups.set(group.key, {
      label: group.label,
      value: (current?.value ?? 0) + value,
    });
    if (group.key !== "unknown") {
      classifiedValue += value;
      classifiedPositions += 1;
    }
    const valueDate =
      position.estimatedValue != null
        ? (position.estimatedThrough ?? position.referenceDate)
        : position.referenceDate;
    if (valueDate) dates.add(valueDate);
    if (position.conversionDate) dates.add(position.conversionDate);
  }

  const sortedGroups = [...groups.values()].sort(
    (left, right) => right.value - left.value,
  );
  const denominator = totalValue > 0 ? totalValue : 0;

  return {
    totalValue,
    valuedPositions,
    unvaluedPositions: positions.length - valuedPositions,
    classifiedValue,
    unclassifiedValue: totalValue - classifiedValue,
    classifiedPositions,
    unclassifiedPositions: valuedPositions - classifiedPositions,
    largestShare:
      denominator > 0 && sortedGroups.length > 0
        ? (sortedGroups[0].value / denominator) * 100
        : 0,
    groups: sortedGroups.map((group) => ({
      ...group,
      percentage: denominator > 0 ? (group.value / denominator) * 100 : 0,
    })),
    referenceDates: [...dates].sort(),
  };
}
