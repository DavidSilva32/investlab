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

export function mergePartialPositionCandidates<
  T extends {
    assetKeys: string[];
    differenceCents: string;
    transfers?: unknown[];
  },
>(baseline: T[], expanded: T[], alternativesLimited: boolean) {
  const unique = new Map<string, T>();
  for (const candidate of [...baseline, ...expanded]) {
    const signature = JSON.stringify(candidate.assetKeys);
    if (!unique.has(signature)) unique.set(signature, candidate);
  }
  const candidates = [...unique.values()].sort((left, right) => {
    const leftDifference = BigInt(left.differenceCents);
    const rightDifference = BigInt(right.differenceCents);
    const leftDistance = absolute(leftDifference);
    const rightDistance = absolute(rightDifference);
    if (leftDistance !== rightDistance)
      return leftDistance < rightDistance ? -1 : 1;
    const leftTransfers = left.transfers?.length ?? 0;
    const rightTransfers = right.transfers?.length ?? 0;
    if (leftTransfers !== rightTransfers) return leftTransfers - rightTransfers;
    return compareText(
      JSON.stringify(left.assetKeys),
      JSON.stringify(right.assetKeys),
    );
  });
  return {
    candidates: candidates.slice(0, MAX_CANDIDATES),
    alternativesLimited:
      alternativesLimited || candidates.length > MAX_CANDIDATES,
  };
}

const MAX_GROUPS = 40;
const MAX_EXACT_GROUPS = 36;
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
      const assetKeys = [...selected].sort(compareText);
      if (
        absoluteDifference === nearestDifference &&
        !nearestCandidates.some((candidate) =>
          sameKeys(candidate.assetKeys, assetKeys),
        )
      ) {
        if (nearestCandidates.length < MAX_CANDIDATES) {
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

    if (index >= valued.length) return;

    selected.push(valued[index].assetKey);
    visit(index + 1, total + valued[index].cents, selected);
    selected.pop();
    visit(index + 1, total, selected);
  }

  if (valued.length <= MAX_EXACT_GROUPS) {
    const exact = findExactCandidates(valued, targetCents);
    const bucket = exact.distance === 0n ? exactCandidates : nearestCandidates;
    nearestDifference = exact.distance;
    bucket.push(
      ...exact.candidates.map(
        ({ leftMask: _leftMask, rightMask: _rightMask, ...candidate }) =>
          candidate,
      ),
    );
    if (exact.distance === 0n) {
      exactAlternativesLimited = exact.alternativesLimited;
    } else {
      nearestAlternativesLimited = exact.alternativesLimited;
    }
  } else {
    visit(0, 0n, []);
    if (visitedNodes >= MAX_VISITED_NODES) searchLimited = true;
  }

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
    assetKeys: candidate.assetKeys,
    totalCents: candidate.totalCents,
    differenceCents: candidate.differenceCents,
    total: candidate.total,
    difference: candidate.difference,
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

type SearchSubset = {
  total: bigint;
  mask: number;
  count: number;
};
type SearchCandidate = {
  assetKeys: string[];
  totalCents: string;
  differenceCents: string;
  total: number;
  difference: number;
  leftMask: number;
  rightMask: number;
};

function findExactCandidates(
  holdings: { assetKey: string; cents: bigint }[],
  target: bigint,
): {
  distance: bigint;
  candidates: SearchCandidate[];
  alternativesLimited: boolean;
} {
  const keyOrdered = [...holdings].sort((a, b) =>
    compareText(a.assetKey, b.assetKey),
  );
  const midpoint = Math.floor(keyOrdered.length / 2);
  const leftHoldings = keyOrdered.slice(0, midpoint);
  const rightHoldings = keyOrdered.slice(midpoint);
  const left = enumerateSearchSubsets(leftHoldings);
  const right = enumerateSearchSubsets(rightHoldings).sort(
    (a, b) =>
      compareBigint(a.total, b.total) ||
      a.count - b.count ||
      compareMasksLex(a.mask, b.mask),
  );
  let distance: bigint | null = null;

  for (const subset of left) {
    const index = searchLowerBound(right, target - subset.total);
    for (const candidateIndex of [index - 1, index]) {
      const candidate = right[candidateIndex];
      if (!candidate || subset.total + candidate.total === 0n) continue;
      const difference = absolute(target - subset.total - candidate.total);
      if (distance === null || difference < distance) distance = difference;
    }
  }

  const bestDistance = distance!;
  const selected: SearchCandidate[] = [];
  let alternativesLimited = false;
  const desiredDistances =
    bestDistance === 0n ? [0n] : [bestDistance, -bestDistance];
  for (const subset of left) {
    for (const signedDistance of desiredDistances) {
      const wanted = target + signedDistance - subset.total;
      if (wanted < 0n) continue;
      const start = searchLowerBound(right, wanted);
      const end = searchUpperBound(right, wanted);
      let foundAtSum = 0;
      for (let index = start; index < end; index += 1) {
        const other = right[index];
        const total = subset.total + other.total;
        if (total === 0n) continue;
        const selectedCount = subset.count + other.count;
        const worst = selected[selected.length - 1];
        if (
          selected.length >= MAX_CANDIDATES &&
          (selectedCount > worst.assetKeys.length ||
            (selectedCount === worst.assetKeys.length &&
              compareMaskPairs(
                subset.mask,
                other.mask,
                worst.leftMask,
                worst.rightMask,
              ) >= 0))
        ) {
          alternativesLimited = true;
        } else {
          const candidateKeys = buildMaskedCombination(
            leftHoldings,
            subset.mask,
            rightHoldings,
            other.mask,
          );
          if (
            selected.some((candidate) =>
              sameKeys(candidate.assetKeys, candidateKeys),
            )
          ) {
            foundAtSum += 1;
            continue;
          }
          selected.push({
            assetKeys: candidateKeys,
            totalCents: total.toString(),
            differenceCents: (target - total).toString(),
            total: centsToNumber(total)!,
            difference: centsToNumber(target - total)!,
            leftMask: subset.mask,
            rightMask: other.mask,
          });
          selected.sort(
            (a, b) =>
              a.assetKeys.length - b.assetKeys.length ||
              compareMaskPairs(
                a.leftMask,
                a.rightMask,
                b.leftMask,
                b.rightMask,
              ),
          );
          if (selected.length > MAX_CANDIDATES) {
            selected.pop();
            alternativesLimited = true;
          }
        }
        foundAtSum += 1;
        // Four representatives per fixed left subset suffice to retain three
        // displayed alternatives plus the signal that more equivalent ones exist.
        if (foundAtSum === MAX_CANDIDATES + 1) {
          alternativesLimited = alternativesLimited || start + foundAtSum < end;
          break;
        }
      }
    }
  }
  return { distance: bestDistance, candidates: selected, alternativesLimited };
}

function enumerateSearchSubsets(
  holdings: { assetKey: string; cents: bigint }[],
): SearchSubset[] {
  const subsets: SearchSubset[] = [{ total: 0n, mask: 0, count: 0 }];
  holdings.forEach((holding, index) => {
    const originalLength = subsets.length;
    for (let subsetIndex = 0; subsetIndex < originalLength; subsetIndex += 1) {
      const subset = subsets[subsetIndex];
      subsets.push({
        total: subset.total + holding.cents,
        mask: subset.mask + 2 ** index,
        count: subset.count + 1,
      });
    }
  });
  return subsets;
}

function searchLowerBound(subsets: SearchSubset[], target: bigint) {
  let low = 0;
  let high = subsets.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (subsets[middle].total < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function searchUpperBound(subsets: SearchSubset[], target: bigint) {
  let low = 0;
  let high = subsets.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (subsets[middle].total <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function compareBigint(left: bigint, right: bigint) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareMaskPairs(
  leftLeft: number,
  leftRight: number,
  rightLeft: number,
  rightRight: number,
) {
  const leftComparison = compareMasksLex(leftLeft, rightLeft);
  return leftComparison || compareMasksLex(leftRight, rightRight);
}

function compareMasksLex(left: number, right: number) {
  if (left === right) return 0;
  const firstDifferingBit = (left ^ right) & -(left ^ right);
  return left & firstDifferingBit ? -1 : 1;
}

function buildMaskedCombination(
  left: { assetKey: string }[],
  leftMask: number,
  right: { assetKey: string }[],
  rightMask: number,
) {
  const keys: string[] = [];
  left.forEach((holding, index) => {
    if ((leftMask & (2 ** index)) !== 0) keys.push(holding.assetKey);
  });
  right.forEach((holding, index) => {
    if ((rightMask & (2 ** index)) !== 0) keys.push(holding.assetKey);
  });
  return keys.sort(compareText);
}
