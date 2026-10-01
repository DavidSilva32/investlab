import { centsToNumber, decimalToCents } from "@/lib/portfolio-money";

export const reserveObjectiveId = "00000000-0000-4000-8000-000000000010";

export type ObjectivePosition = {
  assetKey: string;
  product: string;
  assetCode: string | null;
  institution: string | null;
  assetClass: string | null;
  positionCount: number;
  value: number | null;
  valueCents?: string | null;
  knownValue: number;
  knownValueCents?: string;
  unvaluedPositions: number;
  referenceDate: string | null;
  source: string | null;
  canonicalValueSource?: string;
};

export function calculateObjectiveValue(
  assignedAssetKeys: string[],
  positions: ObjectivePosition[],
): {
  currentValue: number | null;
  currentValueCents: string | null;
  knownValue: number;
  knownValueCents: string;
  missingPositionCount: number;
  unvaluedPositionCount: number;
} {
  const byKey = new Map(
    positions.map((position) => [position.assetKey, position]),
  );
  let knownValueCents = 0n;
  let missingPositionCount = 0;
  let unvaluedPositionCount = 0;

  for (const assetKey of assignedAssetKeys) {
    const position = byKey.get(assetKey);
    if (!position) {
      missingPositionCount += 1;
      continue;
    }
    if (position.value === null) {
      knownValueCents += getKnownCents(position);
      unvaluedPositionCount += position.unvaluedPositions;
      continue;
    }
    knownValueCents += getKnownCents(position);
    unvaluedPositionCount += position.unvaluedPositions;
  }

  return {
    currentValue:
      missingPositionCount > 0 || unvaluedPositionCount > 0
        ? null
        : centsToNumber(knownValueCents),
    currentValueCents:
      missingPositionCount > 0 || unvaluedPositionCount > 0
        ? null
        : knownValueCents.toString(),
    knownValue: centsToNumber(knownValueCents) ?? 0,
    knownValueCents: knownValueCents.toString(),
    missingPositionCount,
    unvaluedPositionCount,
  };
}

function getKnownCents(position: ObjectivePosition) {
  if (position.knownValueCents !== undefined) {
    return BigInt(position.knownValueCents);
  }
  return decimalToCents(position.knownValue) ?? 0n;
}
