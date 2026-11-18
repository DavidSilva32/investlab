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
    groupingDescription:
      "Ações com tipo de ativo identificado no Brasil e BDRs identificados.",
    colorToken: "--asset-class-brazilian-equities",
  },
  {
    id: "international_etfs",
    label: "ETFs internacionais",
    groupingDescription:
      "ETFs identificados como Renda variável com geografia Exterior ou Global.",
    colorToken: "--asset-class-international-etfs",
  },
  {
    id: "fiis",
    label: "Fundos imobiliários (FIIs)",
    groupingDescription:
      "Posições identificadas como FII com classe Fundos ou Renda variável.",
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
  subClass?: string | null;
  geography: string | null;
}): StrategyAssetClassId | null {
  const normalize = (value: string | null | undefined) =>
    (value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");
  const product = normalize(position.product);
  const subClass = normalize(position.subClass);
  const assetClass = normalize(position.assetClass);
  const geography = normalize(position.geography);

  // Explicit fixed-income classification takes precedence over product labels
  // such as "ETF", which can also describe bond funds.
  if (assetClass === "renda fixa") return "fixed_income";

  const productDescription = `${product} ${subClass}`;
  if (
    /\b(fii|fiis|fundo imobiliario|fundos imobiliarios|fdo\s+inv\s+imob|fdo\s+imob)\b/.test(
      productDescription,
    ) &&
    ["fundos", "renda variavel"].includes(assetClass)
  )
    return "fiis";

  if (
    /\betf\b/.test(productDescription) &&
    assetClass === "renda variavel" &&
    ["exterior", "global"].includes(geography)
  ) {
    return "international_etfs";
  }

  if (/\bbdrs?\b/.test(productDescription) && assetClass === "renda variavel") {
    return "brazilian_equities";
  }

  const explicitlyIdentifiedEquity =
    /\b(acao|acoes|ordinaria|preferencial)\b/.test(productDescription);
  if (
    explicitlyIdentifiedEquity &&
    assetClass === "renda variavel" &&
    geography === "brasil"
  ) {
    return "brazilian_equities";
  }

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

export type StrategyAllocationPosition = {
  product: string;
  assetClass: string | null;
  subClass?: string | null;
  geography?: string | null;
  knownValueCents?: string | null;
  valueCents?: string | null;
  positionCount?: number;
};

export type StrategyObjectiveBalance = {
  id: string;
  kind: string;
  purpose: string | null;
  name: string;
  balanceTracking: { observedAmountCents: string; observedOn: string } | null;
};

export function calculateLongTermStrategyWealth(
  allocation: ReturnType<typeof summarizeStrategyAllocation>,
  objectives: StrategyObjectiveBalance[],
) {
  const excludedObjectives = objectives
    .filter(
      (objective) =>
        objective.kind === "RESERVE" || objective.purpose === "PERSONAL_GOAL",
    )
    .map((objective) => ({
      id: objective.id,
      name: objective.name,
      amountCents: objective.balanceTracking?.observedAmountCents ?? null,
      observedOn: objective.balanceTracking?.observedOn ?? null,
    }));
  const missingObjectives = excludedObjectives.filter(
    (objective) => objective.amountCents === null,
  );
  const excludedBalanceCents = excludedObjectives.reduce(
    (sum, objective) =>
      sum +
      (objective.amountCents === null ? 0n : BigInt(objective.amountCents)),
    0n,
  );
  const fixedIncome = allocation.classes.find(
    ({ id }) => id === "fixed_income",
  );
  const fixedIncomeCents = BigInt(fixedIncome?.knownValueCents ?? "0");
  const strategyTotalCents =
    BigInt(allocation.knownValueCents) - excludedBalanceCents;
  const limitation =
    missingObjectives.length > 0
      ? "missing_objective_balance"
      : excludedBalanceCents > fixedIncomeCents
        ? "objective_balances_exceed_fixed_income"
        : null;

  if (limitation) {
    return {
      complete: false,
      limitation,
      knownValueCents: null,
      excludedBalanceCents: excludedBalanceCents.toString(),
      excludedObjectives,
      missingObjectiveNames: missingObjectives.map(({ name }) => name),
      classes: [],
    };
  }

  const adjustedClassValues = allocation.classes.map((assetClass) => ({
    ...assetClass,
    knownValueCents:
      assetClass.id === "fixed_income"
        ? (BigInt(assetClass.knownValueCents) - excludedBalanceCents).toString()
        : assetClass.knownValueCents,
  }));
  const classifiedValueCents = adjustedClassValues.reduce(
    (sum, assetClass) => sum + BigInt(assetClass.knownValueCents),
    0n,
  );
  const representedBasisPoints =
    strategyTotalCents <= 0n
      ? 0n
      : (classifiedValueCents * 10000n + strategyTotalCents / 2n) /
        strategyTotalCents;
  const classBasisPoints = allocateCentsByProportionalGap(
    adjustedClassValues.map(({ knownValueCents }) => BigInt(knownValueCents)),
    representedBasisPoints,
    false,
  );

  return {
    complete: true,
    limitation: null,
    knownValueCents: strategyTotalCents.toString(),
    excludedBalanceCents: excludedBalanceCents.toString(),
    excludedObjectives,
    missingObjectiveNames: [],
    classes: adjustedClassValues.map((assetClass, index) => ({
      ...assetClass,
      percentageBasisPoints: Number(classBasisPoints[index]),
      currentPercentage: Number(classBasisPoints[index]) / 100,
    })),
  };
}

export function summarizeStrategyAllocation(
  positions: StrategyAllocationPosition[],
) {
  const values = Object.fromEntries(
    strategyAssetClasses.map(({ id }) => [id, 0n]),
  ) as Record<StrategyAssetClassId, bigint>;
  let knownValueCents = 0n;
  let unclassifiedKnownValueCents = 0n;
  let unclassifiedPositionCount = 0;

  for (const position of positions) {
    const cents = BigInt(
      position.knownValueCents ?? position.valueCents ?? "0",
    );
    knownValueCents += cents;
    const id = getStrategyAssetClassId({
      ...position,
      geography: position.geography ?? null,
    });
    if (id) values[id] += cents;
    else {
      unclassifiedKnownValueCents += cents;
      unclassifiedPositionCount += position.positionCount ?? 1;
    }
  }

  const classifiedValueCents = strategyAssetClasses.reduce(
    (sum, { id }) => sum + values[id],
    0n,
  );
  const representedBasisPoints =
    knownValueCents === 0n
      ? 0n
      : (classifiedValueCents * 10000n + knownValueCents / 2n) /
        knownValueCents;
  const classBasisPoints = allocateCentsByProportionalGap(
    strategyAssetClasses.map(({ id }) => values[id]),
    representedBasisPoints,
    false,
  );

  return {
    knownValueCents: knownValueCents.toString(),
    unclassifiedKnownValueCents: unclassifiedKnownValueCents.toString(),
    unclassifiedPositionCount,
    unclassifiedPercentageBasisPoints: Number(
      knownValueCents === 0n ? 0n : 10000n - representedBasisPoints,
    ),
    classes: strategyAssetClasses.map(({ id, label }, index) => ({
      id,
      label,
      knownValueCents: values[id].toString(),
      percentageBasisPoints: Number(classBasisPoints[index]),
      currentPercentage: Number(classBasisPoints[index]) / 100,
    })),
  };
}

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
