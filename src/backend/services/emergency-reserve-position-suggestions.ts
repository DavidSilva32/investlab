export type ReserveSuggestionHolding = {
  assetKey: string;
  product: string;
  institution: string | null;
  value: number | null;
};

export type ReservePositionSuggestion = {
  assetKeys: string[];
  total: number;
  difference: number;
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

const toCents = (value: number) => {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(
    value.toString(),
  )!;
  const digits = BigInt(match[2] + (match[3] || ""));
  const decimalPlaces = (match[3] || "").length;
  const scale = Number(match[4] || 0) - decimalPlaces + 2;
  if (scale >= 0) return Number(digits * 10n ** BigInt(scale));

  const divisor = 10n ** BigInt(-scale);
  const quotient = digits / divisor;
  const remainder = digits % divisor;
  const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;
  return Number(rounded);
};
const fromCents = (value: number) => value / 100;

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

  const target = toCents(targetAmount);
  if (target <= 0) return { status: "invalid_target" };

  const valued = holdings
    .filter(
      (holding) =>
        holding.value !== null &&
        Number.isFinite(holding.value) &&
        holding.value > 0,
    )
    .map((holding) => ({
      assetKey: holding.assetKey,
      cents: toCents(holding.value!),
    }))
    .filter((holding) => holding.cents > 0)
    .sort((left, right) => right.cents - left.cents);

  if (valued.length === 0) return { status: "no_valued_positions" };
  if (valued.length > MAX_GROUPS) {
    return { status: "too_many_positions", maximum: MAX_GROUPS };
  }

  const exactCandidates: ReservePositionSuggestion[] = [];
  const nearestCandidates: ReservePositionSuggestion[] = [];
  let nearestDifference = Number.POSITIVE_INFINITY;
  let visitedNodes = 0;
  let searchLimited = false;
  let exactAlternativesLimited = false;
  let nearestAlternativesLimited = false;

  function visit(index: number, total: number, selected: string[]) {
    if (visitedNodes >= MAX_VISITED_NODES) {
      searchLimited = true;
      return;
    }
    visitedNodes += 1;

    if (total > 0) {
      const difference = target - total;
      if (difference === 0) {
        if (
          !exactCandidates.some((candidate) =>
            sameKeys(candidate.assetKeys, selected),
          )
        ) {
          if (exactCandidates.length < MAX_CANDIDATES) {
            exactCandidates.push({
              assetKeys: [...selected],
              total: fromCents(total),
              difference: 0,
            });
          } else {
            exactAlternativesLimited = true;
          }
        }
        return;
      }

      if (Math.abs(difference) < nearestDifference) {
        nearestDifference = Math.abs(difference);
        nearestCandidates.length = 0;
        nearestAlternativesLimited = false;
      }
      if (
        Math.abs(difference) === nearestDifference &&
        !nearestCandidates.some((candidate) =>
          sameKeys(candidate.assetKeys, selected),
        )
      ) {
        if (nearestCandidates.length < MAX_CANDIDATES) {
          nearestCandidates.push({
            assetKeys: [...selected],
            total: fromCents(total),
            difference: fromCents(difference),
          });
        } else {
          nearestAlternativesLimited = true;
        }
      }
    }

    if (total >= target || index >= valued.length) return;

    selected.push(valued[index].assetKey);
    visit(index + 1, total + valued[index].cents, selected);
    selected.pop();
    visit(index + 1, total, selected);
  }

  visit(0, 0, []);

  const candidates = (
    exactCandidates.length ? exactCandidates : nearestCandidates
  ).sort(
    (left, right) =>
      left.assetKeys.length - right.assetKeys.length ||
      left.assetKeys.join("|").localeCompare(right.assetKeys.join("|")),
  );
  return {
    status: "suggestions",
    kind: exactCandidates.length ? "exact" : "nearest",
    candidates,
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
