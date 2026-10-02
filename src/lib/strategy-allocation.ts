import { allocateCentsByProportionalGap } from "@/lib/proportional-cent-allocation";

export const strategyAssetClasses = [
  { id: "fixed_income", label: "Renda fixa" },
  { id: "brazilian_equities", label: "Ações brasileiras" },
  { id: "international_etfs", label: "ETFs internacionais" },
  { id: "fiis", label: "FIIs" },
] as const;

export type StrategyAssetClassId = (typeof strategyAssetClasses)[number]["id"];
export type StrategyAllocationPercentages = Record<
  StrategyAssetClassId,
  number
>;

type SimulationInput = {
  currentValuesCents: Record<StrategyAssetClassId, string>;
  targetPercentages: StrategyAllocationPercentages;
  contributionCents: string;
};

export function simulateStrategyContribution({
  currentValuesCents,
  targetPercentages,
  contributionCents,
}: SimulationInput) {
  const values = strategyAssetClasses.map(({ id }) =>
    BigInt(currentValuesCents[id]),
  );
  const targets = strategyAssetClasses.map(({ id }) =>
    BigInt(Math.round(targetPercentages[id] * 100)),
  );
  const contribution = BigInt(contributionCents);
  const total = values.reduce((sum, value) => sum + value, 0n);
  const projectedTotal = total + contribution;
  const gaps = values.map((value, index) => {
    const targetValue = (projectedTotal * targets[index] + 5000n) / 10000n;
    return targetValue > value ? targetValue - value : 0n;
  });
  const allocations = allocateCentsByProportionalGap(gaps, contribution);
  const assigned = allocations.reduce((sum, value) => sum + value, 0n);

  return {
    totalCents: total.toString(),
    contributionCents: contribution.toString(),
    projectedTotalCents: projectedTotal.toString(),
    unallocatedContributionCents: (contribution - assigned).toString(),
    allocations: strategyAssetClasses.map(({ id, label }, index) => {
      const current = values[index];
      const allocated = allocations[index];
      const projected = current + allocated;
      return {
        id,
        label,
        currentValueCents: current.toString(),
        targetPercentage: targetPercentages[id],
        currentPercentage:
          total === 0n
            ? 0
            : Number((current * 10000n + total / 2n) / total) / 100,
        projectedValueCents: projected.toString(),
        projectedPercentage:
          projectedTotal === 0n
            ? 0
            : Number(
                (projected * 10000n + projectedTotal / 2n) / projectedTotal,
              ) / 100,
        contributionValueCents: allocated.toString(),
      };
    }),
  };
}
