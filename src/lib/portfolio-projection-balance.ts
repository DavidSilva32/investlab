import type { ObjectivePosition } from "@/app/portfolio/_components/portfolio-objective-assignment";
import type { PortfolioObjective } from "@/app/portfolio/_components/portfolio-objective-card";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

export type DatedProjectionBalance = {
  amount: number;
  referenceDate: string;
  source: "objective" | "portfolio";
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
  return { amount, referenceDate, source };
}

export function resolvePortfolioProjectionBalance(
  positions: ObjectivePosition[],
  objectives: PortfolioObjective[],
  summary?: {
    knownTotal: number;
    missingPositionCount: number;
    unvaluedPositionCount: number;
  },
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
      (total, position) => total + position.unvaluedPositions,
      0,
    );
  const total =
    summary?.knownTotal ??
    positions.reduce((sum, position) => sum + (position.value ?? 0), 0);
  return completeDatedBalance(
    positions,
    total,
    missingPositionCount,
    unvaluedPositionCount,
    "portfolio",
  );
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
