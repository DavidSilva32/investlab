import { isValidPortfolioAllocationTargets } from "@/lib/portfolio-allocation-target-values";
import { portfolioAssetClassOptions } from "@/lib/portfolio-classification-options";
import type { EmergencyReserveCalculation } from "@/lib/emergency-reserve";
import { getEmergencyReserveAssetKey } from "@/lib/emergency-reserve-asset-key";
import { allocateCentsByProportionalGap } from "@/lib/proportional-cent-allocation";

export type ContributionPosition = {
  product: string;
  assetCode: string | null;
  institution: string | null;
  issuer: string | null;
  indexer: string | null;
  regimeType: string | null;
  issuedAt: string | null;
  maturityAt: string | null;
  assetKey?: string;
  estimatedValue?: number | null;
  canonicalValueCents?: string | null;
  totalValue: string | null;
  classification: { assetClass: string | null };
};

export type ContributionAllocationStatus =
  | "ready"
  | "needs_targets"
  | "incomplete_data"
  | "reserve_incomplete"
  | "no_positions"
  | "no_gap";

export type ContributionAllocationResult = {
  allocationMode?: "legacy" | "strategy";
  status: ContributionAllocationStatus;
  strategySource: "user_defined" | "system_calculated";
  contributionAmount: number;
  reserveAmount: number | null;
  remainingAmount: number | null;
  unallocatedAmount: number | null;
  reserveStatus: "applied" | "not_needed" | "not_configured" | "incomplete";
  reserveDifference: number | null;
  longTermPortfolioValue: number | null;
  unknownPositionCount: number;
  allocations: Array<{
    assetClass: string;
    currentValue: number;
    currentPercentage: number;
    targetPercentage: number;
    targetGapValue: number;
    contributionAmount: number;
  }>;
};

type Input = {
  contributionAmount: number;
  positions: ContributionPosition[];
  targets: unknown;
  reserve: EmergencyReserveCalculation;
  selectedReserveAssetKeys: string[];
  strategySource?: "user_defined" | "system_calculated";
};

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);
const money = (valueInCents: number) => valueInCents / 100;

export type ReservePriorityAmounts = {
  contributionCents: number;
  reserveCents: number | null;
  remainingCents: number | null;
  reserveStatus: "applied" | "not_needed" | "not_configured" | "incomplete";
};

export function calculateReservePriorityAmounts(
  contributionAmount: number,
  reserve: EmergencyReserveCalculation,
): ReservePriorityAmounts {
  const contributionCents = Math.max(0, cents(contributionAmount));
  const incompleteReserve =
    reserve.unvaluedGroups > 0 || (reserve.missingSelectionCount ?? 0) > 0;
  const hasReserveTarget =
    reserve.targetValue !== null &&
    reserve.difference !== null &&
    reserve.monthlyExpenses !== null &&
    reserve.targetMonths !== null;
  const reserveStatus = incompleteReserve
    ? "incomplete"
    : !hasReserveTarget
      ? "not_configured"
      : reserve.status === "below_target"
        ? "applied"
        : "not_needed";
  if (reserveStatus === "incomplete") {
    return {
      contributionCents,
      reserveCents: null,
      remainingCents: null,
      reserveStatus,
    };
  }
  const reserveCents =
    reserveStatus === "applied"
      ? Math.min(contributionCents, Math.max(0, cents(reserve.difference!)))
      : 0;
  return {
    contributionCents,
    reserveCents,
    remainingCents: contributionCents - reserveCents,
    reserveStatus,
  };
}

const isAssetClass = (
  value: string | null,
): value is (typeof portfolioAssetClassOptions)[number] =>
  portfolioAssetClassOptions.some((assetClass) => assetClass === value);

function getPositionValue(position: ContributionPosition) {
  if (position.canonicalValueCents !== undefined) {
    return position.canonicalValueCents === null
      ? null
      : Number(BigInt(position.canonicalValueCents)) / 100;
  }
  const value =
    position.estimatedValue ??
    (position.totalValue === null ? null : Number(position.totalValue));
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

export function calculateContributionAllocation({
  contributionAmount,
  positions,
  targets,
  reserve,
  selectedReserveAssetKeys,
  strategySource = "user_defined",
}: Input): ContributionAllocationResult {
  const priority = calculateReservePriorityAmounts(contributionAmount, reserve);
  const { contributionCents, reserveStatus } = priority;
  const reserveCents = priority.reserveCents ?? 0;
  const remainingCents = priority.remainingCents ?? 0;
  const selectedKeys = new Set(selectedReserveAssetKeys);
  const longTermPositions = positions.filter(
    (position) => !selectedKeys.has(getEmergencyReserveAssetKey(position)),
  );
  const valued: Array<{
    assetClass: string;
    valueCents: number;
  }> = [];
  let unknownPositionCount = 0;
  for (const position of longTermPositions) {
    const value = getPositionValue(position);
    if (value === null || !isAssetClass(position.classification.assetClass)) {
      unknownPositionCount += 1;
      continue;
    }
    valued.push({
      assetClass: position.classification.assetClass,
      valueCents: cents(value),
    });
  }

  const base: Omit<ContributionAllocationResult, "status"> = {
    strategySource,
    contributionAmount: money(contributionCents),
    reserveAmount: reserveStatus === "incomplete" ? null : money(reserveCents),
    remainingAmount:
      reserveStatus === "incomplete" ? null : money(remainingCents),
    unallocatedAmount:
      reserveStatus === "incomplete" ? null : money(remainingCents),
    reserveStatus,
    reserveDifference:
      reserveStatus === "incomplete" ? null : reserve.difference,
    longTermPortfolioValue: null,
    unknownPositionCount,
    allocations: [],
  };

  if (reserveStatus === "incomplete")
    return { ...base, status: "reserve_incomplete" };
  if (!isValidPortfolioAllocationTargets(targets))
    return { ...base, status: "needs_targets" };
  if (unknownPositionCount > 0) return { ...base, status: "incomplete_data" };
  if (longTermPositions.length === 0)
    return { ...base, status: "no_positions" };

  const currentByClass = new Map<string, number>();
  valued.forEach(({ assetClass, valueCents }) => {
    currentByClass.set(
      assetClass,
      (currentByClass.get(assetClass) ?? 0) + valueCents,
    );
  });
  const portfolioCents = valued.reduce(
    (total, position) => total + position.valueCents,
    0,
  );
  if (portfolioCents <= 0) return { ...base, status: "no_positions" };

  const projectedPortfolioCents = portfolioCents + remainingCents;
  const gaps = portfolioAssetClassOptions.map((assetClass) => {
    const currentValue = currentByClass.get(assetClass) ?? 0;
    const targetPercentage = targets[assetClass];
    const targetValue = Math.round(
      (projectedPortfolioCents * targetPercentage) / 100,
    );
    return {
      assetClass,
      currentValue,
      targetPercentage,
      targetGapValue: Math.max(0, targetValue - currentValue),
    };
  });
  const totalGapCents = gaps.reduce(
    (total, gap) => total + gap.targetGapValue,
    0,
  );
  if (remainingCents === 0 || totalGapCents === 0)
    return {
      ...base,
      status: "no_gap",
      longTermPortfolioValue: money(portfolioCents),
      allocations: gaps.map((gap) => ({
        assetClass: gap.assetClass,
        currentValue: money(gap.currentValue),
        currentPercentage: (gap.currentValue / portfolioCents) * 100,
        targetPercentage: gap.targetPercentage,
        targetGapValue: money(gap.targetGapValue),
        contributionAmount: 0,
      })),
    };

  const positiveGaps = gaps.filter((gap) => gap.targetGapValue > 0);
  const distributableCents = Math.min(remainingCents, totalGapCents);
  const contributions = new Map<string, number>();
  const proportionalAllocations = allocateCentsByProportionalGap(
    positiveGaps.map((gap) => BigInt(gap.targetGapValue)),
    BigInt(distributableCents),
  );
  positiveGaps.forEach((gap, index) => {
    contributions.set(gap.assetClass, Number(proportionalAllocations[index]));
  });
  const assignedCents = [...contributions.values()].reduce(
    (total, value) => total + value,
    0,
  );

  const allocations = gaps.map((gap) => ({
    assetClass: gap.assetClass,
    currentValue: money(gap.currentValue),
    currentPercentage: (gap.currentValue / portfolioCents) * 100,
    targetPercentage: gap.targetPercentage,
    targetGapValue: money(gap.targetGapValue),
    contributionAmount: money(contributions.get(gap.assetClass) ?? 0),
  }));
  return {
    ...base,
    status: "ready",
    longTermPortfolioValue: money(portfolioCents),
    unallocatedAmount: money(remainingCents - assignedCents),
    allocations,
  };
}
