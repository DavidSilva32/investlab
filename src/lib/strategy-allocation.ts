import { allocateCentsByProportionalGap } from "@/lib/proportional-cent-allocation";

export const strategyAssetClasses = [
  {
    id: "fixed_income",
    label: "Renda fixa",
    groupingDescription:
      "Grupo atual de posições classificadas como Renda fixa.",
    colorToken: "--asset-class-fixed-income",
  },
  {
    id: "brazilian_equities",
    label: "Ações e BDRs",
    groupingDescription: "Grupo atual de Renda variável com geografia Brasil.",
    colorToken: "--asset-class-brazilian-equities",
  },
  {
    id: "international_etfs",
    label: "ETFs internacionais",
    groupingDescription:
      "Grupo atual de ETFs com geografia Exterior ou Global.",
    colorToken: "--asset-class-international-etfs",
  },
  {
    id: "fiis",
    label: "Fundos imobiliários (FIIs)",
    groupingDescription:
      "Grupo atual de posições identificadas como FII ou fundo imobiliário.",
    colorToken: "--asset-class-fiis",
  },
] as const;

export type StrategyAssetClassId = (typeof strategyAssetClasses)[number]["id"];
export const strategyAssetClassById = Object.fromEntries(
  strategyAssetClasses.map((assetClass) => [assetClass.id, assetClass]),
) as Record<StrategyAssetClassId, (typeof strategyAssetClasses)[number]>;
export const neutralAssetClassColor = "var(--asset-class-neutral)";

export function getStrategyAssetClassId(position: {
  product: string;
  assetClass: string | null;
  geography: string | null;
}): StrategyAssetClassId | null {
  const normalize = (value: string | null | undefined) =>
    (value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");
  const product = normalize(position.product);
  const assetClass = normalize(position.assetClass);
  const geography = normalize(position.geography);
  if (/\b(fii|fiis|fundo imobiliario)\b/.test(product)) return "fiis";
  if (/\betf\b/.test(product) && ["exterior", "global"].includes(geography))
    return "international_etfs";
  if (assetClass === "renda fixa") return "fixed_income";
  if (assetClass === "renda variavel" && geography === "brasil")
    return "brazilian_equities";
  return null;
}

export function getStrategyAssetClassColor(id: StrategyAssetClassId | null) {
  return id
    ? `var(${strategyAssetClassById[id].colorToken})`
    : neutralAssetClassColor;
}

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
