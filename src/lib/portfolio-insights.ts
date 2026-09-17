export type PortfolioInsightPosition = {
  product: string;
  institution: string | null;
  maturityAt: string | null;
  totalValue: string | null;
  estimatedValue?: number | null;
};

export type PortfolioInsights = {
  totalValue: number;
  valuedPositions: number;
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
  upcomingMaturities: Array<{
    product: string;
    maturityAt: string;
    value: number | null;
  }>;
};

const utcDate = (value: string) => new Date(`${value}T00:00:00Z`);
const positionValue = (position: PortfolioInsightPosition) =>
  position.estimatedValue ??
  (position.totalValue === null ? null : Number(position.totalValue));

export function getPortfolioInsights(
  positions: PortfolioInsightPosition[],
  now = new Date(),
): PortfolioInsights {
  const valued = positions.filter(
    (position) => positionValue(position) !== null,
  );
  const totalValue = valued.reduce(
    (total, position) => total + positionValue(position)!,
    0,
  );
  const byInstitution = new Map<string, number>();
  for (const position of valued) {
    const institution = position.institution ?? "Instituição não informada";
    byInstitution.set(
      institution,
      (byInstitution.get(institution) ?? 0) + positionValue(position)!,
    );
  }
  const allocations = [...byInstitution.entries()]
    .map(([institution, value]) => ({
      institution,
      value,
      percentage: totalValue ? (value / totalValue) * 100 : 0,
    }))
    .sort((left, right) => right.value - left.value);
  const largest = valued.reduce<PortfolioInsightPosition | null>(
    (current, position) =>
      !current || positionValue(position)! > positionValue(current)!
        ? position
        : current,
    null,
  );
  const upcomingMaturities = positions
    .filter(
      (position) =>
        position.maturityAt !== null && utcDate(position.maturityAt) >= now,
    )
    .sort(
      (left, right) =>
        utcDate(left.maturityAt!).getTime() -
        utcDate(right.maturityAt!).getTime(),
    )
    .slice(0, 4)
    .map((position) => ({
      product: position.product,
      maturityAt: position.maturityAt!,
      value: positionValue(position),
    }));

  return {
    totalValue,
    valuedPositions: valued.length,
    institutions: byInstitution.size,
    largestPosition: largest
      ? {
          product: largest.product,
          value: positionValue(largest)!,
          percentage: totalValue
            ? (positionValue(largest)! / totalValue) * 100
            : 0,
        }
      : null,
    allocations,
    upcomingMaturities,
  };
}
