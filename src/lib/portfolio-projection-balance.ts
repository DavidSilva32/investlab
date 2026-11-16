import { centsToNumber } from "@/lib/portfolio-money";

type ProjectionPosition = {
  value?: number | null;
  unvaluedPositions?: number;
  referenceDate: string | null;
  estimatedThrough?: string | null;
};

type ObjectiveObservedBalance = {
  balanceTracking?: {
    observedAmountCents: string;
    observedOn: string;
  } | null;
} | null;

export type DatedProjectionBalance = {
  amount: number;
  referenceDate: string | null;
  source: "objective" | "portfolio";
  completeness: "complete" | "partial";
};

export function resolvePortfolioProjectionBalance(
  positions: ProjectionPosition[],
  summary?: {
    knownTotal: number;
    missingPositionCount: number;
    unvaluedPositionCount: number;
    valuedPositionCount?: number;
  },
  knownTotal?: number,
): DatedProjectionBalance | null {
  const missingPositionCount = summary?.missingPositionCount ?? 0;
  const unvaluedPositionCount =
    summary?.unvaluedPositionCount ??
    positions.reduce(
      (total, position) => total + (position.unvaluedPositions ?? 0),
      0,
    );
  const total =
    knownTotal ??
    summary?.knownTotal ??
    positions.reduce((sum, position) => sum + (position.value ?? 0), 0);
  if (!Number.isFinite(total) || total < 0) return null;

  const referenceDates = new Set(
    positions
      .map((position) => position.estimatedThrough ?? position.referenceDate)
      .filter((date): date is string => Boolean(date)),
  );
  const referenceDate =
    referenceDates.size === 1 &&
    positions.length > 0 &&
    positions.every(
      (position) =>
        (position.estimatedThrough ?? position.referenceDate) ===
        [...referenceDates][0],
    )
      ? [...referenceDates][0]!
      : null;
  const valuedPositionCount =
    summary?.valuedPositionCount ??
    positions.filter((position) => position.value != null).length;
  const allPositionsValued = valuedPositionCount === positions.length;
  const completeBalance =
    allPositionsValued &&
    missingPositionCount === 0 &&
    unvaluedPositionCount === 0 &&
    referenceDate !== null &&
    isValidDate(referenceDate);

  return {
    amount: total,
    referenceDate: completeBalance ? referenceDate : null,
    source: "portfolio",
    completeness: completeBalance ? "complete" : "partial",
  };
}

export function resolveObjectiveProjectionBalance(
  objective: ObjectiveObservedBalance,
): DatedProjectionBalance | null {
  const observedBalance = objective?.balanceTracking;
  if (!observedBalance || !/^\d+$/.test(observedBalance.observedAmountCents)) {
    return null;
  }
  const amount = centsToNumber(BigInt(observedBalance.observedAmountCents));
  if (amount === null || !Number.isFinite(amount) || amount < 0) return null;
  const isDateValid = isValidDate(observedBalance.observedOn);
  return {
    amount,
    referenceDate: isDateValid ? observedBalance.observedOn : null,
    source: "objective",
    completeness: isDateValid ? "complete" : "partial",
  };
}

function isValidDate(referenceDate: string) {
  const parsedDate = new Date(`${referenceDate}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(referenceDate) &&
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === referenceDate
  );
}
