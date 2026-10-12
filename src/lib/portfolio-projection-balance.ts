import type { ObjectivePosition } from "@/app/portfolio/_components/portfolio-objective-assignment";
import type { PortfolioObjective } from "@/app/portfolio/_components/portfolio-objective-card";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

export type DatedProjectionBalance = {
  amount: number;
  referenceDate: string | null;
  source: "objective" | "portfolio";
  completeness: "complete" | "partial";
};

function completeDatedBalance(
  positions: ObjectivePosition[],
  amount: number | null,
  missingPositionCount: number,
  unvaluedPositionCount: number,
  source: DatedProjectionBalance["source"],
): DatedProjectionBalance | null {
  if (
    amount === null ||
    positions.length === 0 ||
    missingPositionCount > 0 ||
    unvaluedPositionCount > 0 ||
    positions.some(
      (position) =>
        position.value === null ||
        !(position.estimatedThrough ?? position.referenceDate),
    )
  ) {
    return null;
  }
  const referenceDates = new Set(
    positions
      .map((position) => position.estimatedThrough ?? position.referenceDate)
      .filter((date): date is string => Boolean(date)),
  );
  if (referenceDates.size !== 1) return null;
  const referenceDate = [...referenceDates][0]!;
  const parsedDate = new Date(`${referenceDate}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(referenceDate) ||
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== referenceDate
  ) {
    return null;
  }
  return { amount, referenceDate, source, completeness: "complete" };
}

export function resolvePortfolioProjectionBalance(
  positions: Array<
    Pick<ObjectivePosition, "referenceDate" | "estimatedThrough"> &
      Partial<Pick<ObjectivePosition, "value" | "unvaluedPositions">>
  >,
  objectives: PortfolioObjective[],
  summary?: {
    knownTotal: number;
    missingPositionCount: number;
    unvaluedPositionCount: number;
    valuedPositionCount?: number;
  },
  knownTotal?: number,
): DatedProjectionBalance | null {
  const missingPositionCount =
    summary?.missingPositionCount ??
    objectives.reduce(
      (total, objective) => total + objective.missingPositionCount,
      0,
    );
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
  objective: PortfolioObjective | null,
  positions: ObjectivePosition[],
): DatedProjectionBalance | null {
  if (
    !objective ||
    objective.kind === "RESERVE" ||
    objective.id === reserveObjectiveId
  ) {
    return null;
  }
  const assignedPositions = positions.filter((position) =>
    objective.assignedAssetKeys.includes(position.assetKey),
  );
  return completeDatedBalance(
    assignedPositions,
    objective.currentValue,
    objective.missingPositionCount,
    objective.unvaluedPositionCount,
    "objective",
  );
}

function isValidDate(referenceDate: string) {
  const parsedDate = new Date(`${referenceDate}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(referenceDate) &&
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === referenceDate
  );
}
