import { z } from "zod";

const maximumAmount = 1_000_000_000_000;
const rateSchema = z.number().finite().gt(-100).max(1_000);

export const objectiveProjectionInputSchema = z
  .object({
    mode: z.enum(["project_balance", "required_contribution"]),
    targetBasis: z.enum(["future_nominal", "today_purchasing_power"]),
    startingAmount: z.number().finite().min(0).max(maximumAmount),
    targetAmount: z.number().finite().positive().max(maximumAmount),
    horizonYears: z.number().int().min(1).max(100),
    annualReturnPercent: rateSchema,
    annualInflationPercent: rateSchema,
    monthlyContribution: z
      .number()
      .finite()
      .min(0)
      .max(maximumAmount)
      .nullable(),
    adjustContributionsForInflation: z.boolean(),
  })
  .refine(
    (value) =>
      value.mode !== "project_balance" || value.monthlyContribution !== null,
    { path: ["monthlyContribution"], message: "Informe o aporte mensal." },
  );

export type ObjectiveProjectionInput = z.infer<
  typeof objectiveProjectionInputSchema
>;

export type ObjectiveProjectionPoint = {
  year: number;
  investedAmount: number;
  nominalAmount: number;
  purchasingPowerAmount: number;
  nominalTargetAmount: number;
  realTargetAmount: number;
};

export type ObjectiveProjectionResult = {
  mode: ObjectiveProjectionInput["mode"];
  targetBasis: ObjectiveProjectionInput["targetBasis"];
  horizonYears: number;
  annualReturnPercent: number;
  annualInflationPercent: number;
  adjustContributionsForInflation: boolean;
  monthlyContribution: number | null;
  requiredMonthlyContribution: number | null;
  nominalTargetAmount: number;
  realTargetAmount: number;
  projectedNominalAmount: number;
  projectedPurchasingPowerAmount: number;
  totalInvestedAmount: number;
  nominalGrowthAmount: number;
  targetReachedMonth: number | null;
  points: ObjectiveProjectionPoint[];
  contributionTiming: "end_of_month";
};

const roundToCents = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
const roundUpToCents = (value: number) => Math.ceil(value * 100 - 1e-8) / 100;

function assertFiniteResult(value: number) {
  if (!Number.isFinite(value)) {
    throw new RangeError(
      "As premissas geram um valor fora do limite que podemos calcular.",
    );
  }
  return value;
}

function futureValueForContribution(
  monthlyContribution: number,
  months: number,
  monthlyReturn: number,
  annualInflationFactor: number,
  adjustContributionsForInflation: boolean,
) {
  let balance = 0;
  for (let month = 1; month <= months; month += 1) {
    balance *= 1 + monthlyReturn;
    const annualAdjustment = adjustContributionsForInflation
      ? annualInflationFactor ** Math.floor((month - 1) / 12)
      : 1;
    balance += monthlyContribution * annualAdjustment;
  }
  return balance;
}

export function simulateObjectiveProjection(
  input: ObjectiveProjectionInput,
): ObjectiveProjectionResult {
  const months = input.horizonYears * 12;
  const annualReturnFactor = 1 + input.annualReturnPercent / 100;
  const annualInflationFactor = 1 + input.annualInflationPercent / 100;
  const monthlyReturn = annualReturnFactor ** (1 / 12) - 1;
  const targetNominalFactor =
    input.targetBasis === "today_purchasing_power"
      ? annualInflationFactor ** input.horizonYears
      : 1;
  const nominalTargetAmount = roundToCents(
    assertFiniteResult(input.targetAmount * targetNominalFactor),
  );
  const realTargetAmount = roundToCents(
    input.targetBasis === "today_purchasing_power"
      ? input.targetAmount
      : assertFiniteResult(
          input.targetAmount / annualInflationFactor ** input.horizonYears,
        ),
  );

  const requiredMonthlyContribution =
    input.mode === "required_contribution"
      ? (() => {
          const startingBalanceAtTarget =
            input.startingAmount * (1 + monthlyReturn) ** months;
          const remainingTarget = nominalTargetAmount - startingBalanceAtTarget;
          if (remainingTarget <= 0) return 0;
          const contributionFactor = futureValueForContribution(
            1,
            months,
            monthlyReturn,
            annualInflationFactor,
            input.adjustContributionsForInflation,
          );
          return roundUpToCents(
            assertFiniteResult(remainingTarget / contributionFactor),
          );
        })()
      : null;
  const contributionToProject =
    input.mode === "required_contribution"
      ? requiredMonthlyContribution!
      : input.monthlyContribution!;

  let balance = input.startingAmount;
  let totalInvested = input.startingAmount;
  let targetReachedMonth: number | null =
    input.mode === "project_balance" && balance >= input.targetAmount
      ? 0
      : null;
  const getNominalTargetAtMonth = (month: number) =>
    input.targetBasis === "today_purchasing_power"
      ? roundToCents(
          assertFiniteResult(
            input.targetAmount * annualInflationFactor ** (month / 12),
          ),
        )
      : roundToCents(input.targetAmount);
  const getRealTargetAtMonth = (month: number) =>
    input.targetBasis === "today_purchasing_power"
      ? roundToCents(input.targetAmount)
      : roundToCents(
          assertFiniteResult(
            input.targetAmount / annualInflationFactor ** (month / 12),
          ),
        );
  const points: ObjectiveProjectionPoint[] = [];
  const addPoint = (month: number) => {
    const elapsedInflation = annualInflationFactor ** (month / 12);
    points.push({
      year: month / 12,
      investedAmount: roundToCents(assertFiniteResult(totalInvested)),
      nominalAmount: roundToCents(assertFiniteResult(balance)),
      purchasingPowerAmount: roundToCents(
        assertFiniteResult(balance / elapsedInflation),
      ),
      nominalTargetAmount: getNominalTargetAtMonth(month),
      realTargetAmount: getRealTargetAtMonth(month),
    });
  };
  addPoint(0);

  for (
    let month = 1;
    month <= months &&
    (input.mode === "required_contribution" || targetReachedMonth === null);
    month += 1
  ) {
    balance *= 1 + monthlyReturn;
    const targetAtMonth = getNominalTargetAtMonth(month);
    if (input.mode === "project_balance" && balance >= targetAtMonth) {
      targetReachedMonth = month;
    }
    const annualAdjustment = input.adjustContributionsForInflation
      ? annualInflationFactor ** Math.floor((month - 1) / 12)
      : 1;
    const plannedContribution = contributionToProject * annualAdjustment;
    const contribution =
      input.mode === "project_balance" && targetReachedMonth === null
        ? Math.min(plannedContribution, Math.max(0, targetAtMonth - balance))
        : input.mode === "project_balance"
          ? 0
          : plannedContribution;
    balance += contribution;
    totalInvested += contribution;
    if (
      input.mode === "project_balance" &&
      targetReachedMonth === null &&
      balance >= targetAtMonth
    ) {
      targetReachedMonth = month;
    }

    if (month % 12 === 0 || month === months || targetReachedMonth === month) {
      addPoint(month);
    }
  }

  const projectedMonths = targetReachedMonth ?? months;
  const elapsedInflation = annualInflationFactor ** (projectedMonths / 12);

  return {
    mode: input.mode,
    targetBasis: input.targetBasis,
    horizonYears: input.horizonYears,
    annualReturnPercent: input.annualReturnPercent,
    annualInflationPercent: input.annualInflationPercent,
    adjustContributionsForInflation: input.adjustContributionsForInflation,
    monthlyContribution: input.monthlyContribution,
    requiredMonthlyContribution,
    nominalTargetAmount,
    realTargetAmount,
    projectedNominalAmount: roundToCents(assertFiniteResult(balance)),
    projectedPurchasingPowerAmount: roundToCents(
      assertFiniteResult(balance / elapsedInflation),
    ),
    totalInvestedAmount: roundToCents(assertFiniteResult(totalInvested)),
    nominalGrowthAmount: roundToCents(
      assertFiniteResult(balance - totalInvested),
    ),
    targetReachedMonth,
    points,
    contributionTiming: "end_of_month",
  };
}
