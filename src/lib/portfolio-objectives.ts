export const reserveObjectiveId = "00000000-0000-4000-8000-000000000010";

export type ObjectivePosition = {
  assetKey: string;
  product: string;
  assetCode: string | null;
  institution: string | null;
  assetClass: string | null;
  positionCount: number;
  value: number | null;
  knownValue: number;
  unvaluedPositions: number;
  referenceDate: string | null;
  source: string | null;
};

export function calculateObjectiveValue(
  assignedAssetKeys: string[],
  positions: ObjectivePosition[],
): {
  currentValue: number | null;
  knownValue: number;
  missingPositionCount: number;
  unvaluedPositionCount: number;
} {
  const byKey = new Map(
    positions.map((position) => [position.assetKey, position]),
  );
  let knownValue = 0;
  let missingPositionCount = 0;
  let unvaluedPositionCount = 0;

  for (const assetKey of assignedAssetKeys) {
    const position = byKey.get(assetKey);
    if (!position) {
      missingPositionCount += 1;
      continue;
    }
    if (position.value === null) {
      knownValue += position.knownValue;
      unvaluedPositionCount += position.unvaluedPositions;
      continue;
    }
    knownValue += position.knownValue;
    unvaluedPositionCount += position.unvaluedPositions;
  }

  return {
    currentValue:
      missingPositionCount > 0 || unvaluedPositionCount > 0 ? null : knownValue,
    knownValue,
    missingPositionCount,
    unvaluedPositionCount,
  };
}
