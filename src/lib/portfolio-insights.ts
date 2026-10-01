import {
  centsToNumber,
  resolvePositionMoney,
  sumMoneyCents,
} from "@/lib/portfolio-money";

export type PortfolioInsightPosition = {
  product: string;
  institution: string | null;
  maturityAt: string | null;
  totalValue: string | null;
  estimatedValue?: number | null;
  estimatedValueCents?: string | null;
  canonicalValueCents?: string | null;
  referenceDate?: string | null;
  cdbEstimateStatus?: "official" | "provisional" | "unavailable" | null;
};

export type PortfolioInsights = {
  totalValue: number;
  totalValueCents: string;
  valuedPositions: number;
  unvaluedPositions: number;
  provisionalEstimates: number;
  unavailableEstimates: number;
  institutions: number;
  largestPosition: {
    product: string;
    value: number;
    percentage: number;
  } | null;
  allocations: Array<{
    institution: string;
    value: number;
    percentage: number;
  }>;
  chartAllocations: Array<{
    institution: string;
    value: number;
    percentage: number;
  }>;
  topPositions: Array<{
    product: string;
    institution: string | null;
    value: number;
    percentage: number;
  }>;
  upcomingMaturities: Array<{
    product: string;
    maturityAt: string;
    value: number | null;
  }>;
};

const utcDate = (value: string) => new Date(`${value}T00:00:00Z`);
const positionCents = (position: PortfolioInsightPosition) =>
  position.canonicalValueCents !== undefined
    ? position.canonicalValueCents === null
      ? null
      : BigInt(position.canonicalValueCents)
    : resolvePositionMoney(position).cents;

export function getPortfolioInsights(
  positions: PortfolioInsightPosition[],
  now = new Date(),
): PortfolioInsights {
  const valued = positions
    .map((position) => ({ position, cents: positionCents(position) }))
    .filter(
      (item): item is { position: PortfolioInsightPosition; cents: bigint } =>
        item.cents !== null,
    );
  const totalCents = sumMoneyCents(valued.map((item) => item.cents));
  const totalValue = centsToNumber(totalCents) ?? 0;
  const byInstitution = new Map<string, bigint>();
  for (const { position, cents } of valued) {
    const institution = position.institution ?? "Instituição não informada";
    byInstitution.set(
      institution,
      (byInstitution.get(institution) ?? 0n) + cents,
    );
  }
  const sortedInstitutionEntries = [...byInstitution.entries()].sort(
    (left, right) =>
      (left[1] === right[1] ? 0 : left[1] > right[1] ? -1 : 1) ||
      left[0].localeCompare(right[0]),
  );
  const allocations = sortedInstitutionEntries
    .map(([institution, cents]) => ({
      institution,
      value: centsToNumber(cents) ?? 0,
      percentage:
        totalCents > 0n ? (Number(cents) / Number(totalCents)) * 100 : 0,
    }))
    .sort(
      (left, right) =>
        right.value - left.value ||
        left.institution.localeCompare(right.institution),
    );
  const chartAllocations =
    allocations.length > 6
      ? (() => {
          const remainderCents = sortedInstitutionEntries
            .slice(5)
            .reduce((sum, [, cents]) => sum + cents, 0n);
          return [
            ...allocations.slice(0, 5),
            {
              institution: "Demais instituições",
              value: centsToNumber(remainderCents) ?? 0,
              percentage:
                totalCents > 0n
                  ? (Number(remainderCents) / Number(totalCents)) * 100
                  : 0,
            },
          ];
        })()
      : allocations;
  const sortedValued = [...valued].sort(
    (left, right) =>
      (left.cents === right.cents ? 0 : left.cents > right.cents ? -1 : 1) ||
      left.position.product.localeCompare(right.position.product) ||
      (left.position.institution ?? "").localeCompare(
        right.position.institution ?? "",
      ),
  );
  const upcomingMaturities = positions
    .filter(
      (position) =>
        position.maturityAt !== null && utcDate(position.maturityAt) >= now,
    )
    .sort(
      (left, right) =>
        utcDate(left.maturityAt!).getTime() -
          utcDate(right.maturityAt!).getTime() ||
        left.product.localeCompare(right.product),
    )
    .slice(0, 4)
    .map((position) => {
      const cents = positionCents(position);
      return {
        product: position.product,
        maturityAt: position.maturityAt!,
        value: cents === null ? null : centsToNumber(cents),
      };
    });

  return {
    totalValue,
    totalValueCents: totalCents.toString(),
    valuedPositions: valued.length,
    unvaluedPositions: positions.length - valued.length,
    provisionalEstimates: positions.filter(
      (position) => position.cdbEstimateStatus === "provisional",
    ).length,
    unavailableEstimates: positions.filter(
      (position) => position.cdbEstimateStatus === "unavailable",
    ).length,
    institutions: byInstitution.size,
    largestPosition: sortedValued[0]
      ? {
          product: sortedValued[0].position.product,
          value: centsToNumber(sortedValued[0].cents) ?? 0,
          percentage:
            totalCents > 0n
              ? (Number(sortedValued[0].cents) / Number(totalCents)) * 100
              : 0,
        }
      : null,
    allocations,
    chartAllocations,
    topPositions: sortedValued.slice(0, 5).map(({ position, cents }) => ({
      product: position.product,
      institution: position.institution,
      value: centsToNumber(cents) ?? 0,
      percentage:
        totalCents > 0n ? (Number(cents) / Number(totalCents)) * 100 : 0,
    })),
    upcomingMaturities,
  };
}
