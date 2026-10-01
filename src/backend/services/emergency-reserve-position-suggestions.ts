import { centsToNumber, decimalToCents } from "@/lib/portfolio-money";

export type ReserveSuggestionHolding = {
  assetKey: string;
  product: string;
  institution: string | null;
  value: number | null;
  valueCents?: string | null;
  valueSource?: string;
  canonicalValueSource?: string;
  estimationBaseDate?: string | null;
  estimatedThrough?: string | null;
  cdbEstimateComparisonApproximate?: boolean | null;
  cdbEstimateStatus?: "complete" | "provisional" | "unavailable" | null;
  cdbEstimateLimitation?: string | null;
};

export type ReserveSuggestionPosition = ReserveSuggestionHolding & {
  valueCents: string;
};

export type ReservePositionSuggestion = {
  assetKeys: string[];
  totalCents: string;
  differenceCents: string;
  total: number;
  difference: number;
  transfers?: ReservePositionTransfer[];
  impacts?: ReservePositionImpact[];
  positions: ReserveSuggestionPosition[];
};

export type ReservePositionTransfer = {
  assetKey: string;
  product: string;
  value: number;
  fromObjectiveId: string;
  fromObjectiveName: string;
  toObjectiveId: string;
};

export type ReservePositionImpact = {
  objectiveId: string;
  objectiveName: string;
  currentValue: number | null;
  targetAmount: number | null;
  progressPercent: number | null;
  transferredValue: number;
  transferredPositionCount: number;
};

export type EmergencyReservePositionSuggestions =
  | { status: "invalid_target" }
  | { status: "no_valued_positions" }
  | { status: "too_many_positions"; maximum: number }
  | {
      status: "suggestions";
      kind: "exact" | "nearest";
      candidates: ReservePositionSuggestion[];
      searchLimited: boolean;
      alternativesLimited: boolean;
    };

const MAX_GROUPS = 40;
const MAX_VISITED_NODES = 50_000;
const MAX_CANDIDATES = 3;

const compareText = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;
const absolute = (value: bigint) => (value < 0n ? -value : value);
const holdingCents = (holding: ReserveSuggestionHolding) => {
  if (holding.valueCents !== null && holding.valueCents !== undefined) {
    return /^\d+$/.test(holding.valueCents) ? BigInt(holding.valueCents) : null;
  }
  return holding.value !== null && Number.isFinite(holding.value)
    ? decimalToCents(holding.value)
    : null;
};

/**
 * Finds bounded mathematical combinations of current position values. This
 * does not infer the real-world purpose or bank grouping of any position.
 */
export function suggestEmergencyReservePositions(
  targetAmount: number,
  holdings: ReserveSuggestionHolding[],
): EmergencyReservePositionSuggestions {
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
    return { status: "invalid_target" };
  }

  const target = decimalToCents(targetAmount);
  if (target === null || target <= 0n) return { status: "invalid_target" };
  const targetCents = target;

  const valued = holdings
    .map((holding) => ({
      assetKey: holding.assetKey,
      cents: holdingCents(holding),
    }))
    .filter(
      (holding): holding is { assetKey: string; cents: bigint } =>
        holding.cents !== null && holding.cents > 0n,
    )
    .sort((left, right) =>
      left.cents === right.cents
        ? compareText(left.assetKey, right.assetKey)
        : left.cents > right.cents
          ? -1
          : 1,
    );

  if (valued.length === 0) return { status: "no_valued_positions" };
  if (valued.length > MAX_GROUPS) {
    return { status: "too_many_positions", maximum: MAX_GROUPS };
  }

  type CandidateWithoutPositions = Omit<ReservePositionSuggestion, "positions">;
  const exactCandidates: CandidateWithoutPositions[] = [];
  const nearestCandidates: CandidateWithoutPositions[] = [];
  let nearestDifference: bigint | null = null;
  let visitedNodes = 0;
  let searchLimited = false;
  let exactAlternativesLimited = false;
  let nearestAlternativesLimited = false;

  function visit(index: number, total: bigint, selected: string[]) {
    if (visitedNodes >= MAX_VISITED_NODES) {
      searchLimited = true;
      return;
    }
    visitedNodes += 1;

    if (total > 0n) {
      const difference = targetCents - total;
      if (difference === 0n) {
        const assetKeys = [...selected].sort(compareText);
        if (
          !exactCandidates.some((candidate) =>
            sameKeys(candidate.assetKeys, assetKeys),
          )
        ) {
          if (exactCandidates.length < MAX_CANDIDATES) {
            exactCandidates.push({
              assetKeys,
              totalCents: total.toString(),
              differenceCents: "0",
              total: centsToNumber(total)!,
              difference: 0,
            });
          } else {
            exactAlternativesLimited = true;
          }
        }
        return;
      }

      const absoluteDifference = absolute(difference);
      if (
        nearestDifference === null ||
        absoluteDifference < nearestDifference
      ) {
        nearestDifference = absoluteDifference;
        nearestCandidates.length = 0;
        nearestAlternativesLimited = false;
      }
      if (
        absoluteDifference === nearestDifference &&
        !nearestCandidates.some((candidate) =>
          sameKeys(candidate.assetKeys, [...selected].sort(compareText)),
        )
      ) {
        if (nearestCandidates.length < MAX_CANDIDATES) {
          const assetKeys = [...selected].sort(compareText);
          nearestCandidates.push({
            assetKeys,
            totalCents: total.toString(),
            differenceCents: difference.toString(),
            total: centsToNumber(total)!,
            difference: centsToNumber(difference)!,
          });
        } else {
          nearestAlternativesLimited = true;
        }
      }
    }

    if (total >= targetCents || index >= valued.length) return;

    selected.push(valued[index].assetKey);
    visit(index + 1, total + valued[index].cents, selected);
    selected.pop();
    visit(index + 1, total, selected);
  }

  visit(0, 0n, []);

  const candidates = (
    exactCandidates.length ? exactCandidates : nearestCandidates
  ).sort(
    (left, right) =>
      left.assetKeys.length - right.assetKeys.length ||
      compareText(left.assetKeys.join("|"), right.assetKeys.join("|")),
  );
  const holdingsByKey = new Map(
    holdings.map((holding) => [holding.assetKey, holding]),
  );
  const valuedByKey = new Map(
    valued.map((holding) => [holding.assetKey, holding.cents]),
  );
  const candidatesWithPositions = candidates.map((candidate) => ({
    ...candidate,
    positions: candidate.assetKeys.map((assetKey) => {
      const holding = holdingsByKey.get(assetKey)!;
      return {
        ...holding,
        valueCents: valuedByKey.get(assetKey)!.toString(),
      };
    }),
  }));
  return {
    status: "suggestions",
    kind: exactCandidates.length ? "exact" : "nearest",
    candidates: candidatesWithPositions,
    searchLimited,
    alternativesLimited: exactCandidates.length
      ? exactAlternativesLimited
      : nearestAlternativesLimited,
  };
}

function sameKeys(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((key, index) => key === right[index])
  );
}
