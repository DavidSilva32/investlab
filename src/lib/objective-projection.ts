import { z } from "zod";

const maximumAmount = 1_000_000_000_000;
const rateSchema = z.number().finite().gt(-100).max(1_000);

const commonProjectionInputSchema = {
  startingAmount: z.number().finite().min(0).max(maximumAmount),
  horizonYears: z.number().int().min(1).max(100),
  annualReturnPercent: rateSchema,
  annualInflationPercent: rateSchema,
  adjustContributionsForInflation: z.boolean(),
};

export const objectiveProjectionInputSchema = z.discriminatedUnion("mode", [
  z.object({
    ...commonProjectionInputSchema,
    mode: z.literal("project_balance"),
    monthlyContribution: z.number().finite().min(0).max(maximumAmount),
  }),
  z.object({
    ...commonProjectionInputSchema,
    mode: z.literal("required_contribution"),
    targetBasis: z.enum(["future_nominal", "today_purchasing_power"]),
    targetAmount: z.number().finite().positive().max(maximumAmount),
  }),
]);

export type ObjectiveProjectionInput = z.infer<
  typeof objectiveProjectionInputSchema
>;

export type ObjectiveProjectionPoint = {
  year: number;
  investedAmount: number;
  nominalAmount: number;
  purchasingPowerAmount: number;
  nominalTargetAmount?: number;
  realTargetAmount?: number;
};

export type ObjectiveProjectionMonth = {
  month: number;
  year: number;
  monthlyContribution: number;
  investedAmount: number;
  nominalAmount: number;
  purchasingPowerAmount: number;
};

type ObjectiveProjectionResultBase = {
  horizonYears: number;
  annualReturnPercent: number;
  annualInflationPercent: number;
  adjustContributionsForInflation: boolean;
  projectedNominalAmount: number;
  projectedPurchasingPowerAmount: number;
  totalInvestedAmount: number;
  nominalGrowthAmount: number;
  points: ObjectiveProjectionPoint[];
  months: ObjectiveProjectionMonth[];
  contributionTiming: "end_of_month";
};

export type ObjectiveProjectionResult =
  | (ObjectiveProjectionResultBase & {
      mode: "project_balance";
      monthlyContribution: number;
      requiredMonthlyContribution: null;
    })
  | (ObjectiveProjectionResultBase & {
      mode: "required_contribution";
      targetBasis: "future_nominal" | "today_purchasing_power";
      targetAmount: number;
      nominalTargetAmount: number;
      realTargetAmount: number;
      monthlyContribution: null;
      requiredMonthlyContribution: number;
    });

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
  const requiredContribution =
    input.mode === "required_contribution"
      ? (() => {
          const targetNominalFactor =
            input.targetBasis === "today_purchasing_power"
              ? annualInflationFactor ** input.horizonYears
              : 1;
          const nominalTargetAmount = roundToCents(
            assertFiniteResult(input.targetAmount * targetNominalFactor),
          );
          const startingBalanceAtTarget =
            input.startingAmount * (1 + monthlyReturn) ** months;
          const remainingTarget = nominalTargetAmount - startingBalanceAtTarget;
          if (remainingTarget <= 0) {
            return { monthlyAmount: 0, nominalTargetAmount };
          }
          const contributionFactor = futureValueForContribution(
            1,
            months,
            monthlyReturn,
            annualInflationFactor,
            input.adjustContributionsForInflation,
          );
          return {
            monthlyAmount: roundUpToCents(
              assertFiniteResult(remainingTarget / contributionFactor),
            ),
            nominalTargetAmount,
          };
        })()
      : null;
  const contributionToProject =
    input.mode === "required_contribution"
      ? requiredContribution!.monthlyAmount
      : input.monthlyContribution!;

  let balance = input.startingAmount;
  let totalInvested = input.startingAmount;
  const getTargetsAtMonth =
    input.mode === "required_contribution"
      ? (month: number) => ({
          nominalTargetAmount:
            input.targetBasis === "today_purchasing_power"
              ? roundToCents(
                  assertFiniteResult(
                    input.targetAmount * annualInflationFactor ** (month / 12),
                  ),
                )
              : roundToCents(input.targetAmount),
          realTargetAmount:
            input.targetBasis === "today_purchasing_power"
              ? roundToCents(input.targetAmount)
              : roundToCents(
                  assertFiniteResult(
                    input.targetAmount / annualInflationFactor ** (month / 12),
                  ),
                ),
        })
      : null;
  const points: ObjectiveProjectionPoint[] = [];
  const monthlyPoints: ObjectiveProjectionMonth[] = [];
  const addPoint = (month: number) => {
    const elapsedInflation = annualInflationFactor ** (month / 12);
    points.push({
      year: month / 12,
      investedAmount: roundToCents(assertFiniteResult(totalInvested)),
      nominalAmount: roundToCents(assertFiniteResult(balance)),
      purchasingPowerAmount: roundToCents(
        assertFiniteResult(balance / elapsedInflation),
      ),
      ...(getTargetsAtMonth?.(month) ?? {}),
    });
  };
  addPoint(0);

  for (let month = 1; month <= months; month += 1) {
    balance *= 1 + monthlyReturn;
    const annualAdjustment = input.adjustContributionsForInflation
      ? annualInflationFactor ** Math.floor((month - 1) / 12)
      : 1;
    const plannedContribution = contributionToProject * annualAdjustment;
    balance += plannedContribution;
    totalInvested += plannedContribution;

    monthlyPoints.push({
      month,
      year: Math.ceil(month / 12),
      monthlyContribution: assertFiniteResult(plannedContribution),
      investedAmount: roundToCents(assertFiniteResult(totalInvested)),
      nominalAmount: roundToCents(assertFiniteResult(balance)),
      purchasingPowerAmount: roundToCents(
        assertFiniteResult(balance / annualInflationFactor ** (month / 12)),
      ),
    });

    if (month % 12 === 0 || month === months) {
      addPoint(month);
    }
  }

  const elapsedInflation = annualInflationFactor ** input.horizonYears;

  const resultBase: ObjectiveProjectionResultBase = {
    horizonYears: input.horizonYears,
    annualReturnPercent: input.annualReturnPercent,
    annualInflationPercent: input.annualInflationPercent,
    adjustContributionsForInflation: input.adjustContributionsForInflation,
    projectedNominalAmount: roundToCents(assertFiniteResult(balance)),
    projectedPurchasingPowerAmount: roundToCents(
      assertFiniteResult(balance / elapsedInflation),
    ),
    totalInvestedAmount: roundToCents(assertFiniteResult(totalInvested)),
    nominalGrowthAmount: roundToCents(
      assertFiniteResult(balance - totalInvested),
    ),
    points,
    months: monthlyPoints,
    contributionTiming: "end_of_month",
  };

  if (input.mode === "project_balance") {
    return {
      ...resultBase,
      mode: input.mode,
      monthlyContribution: input.monthlyContribution,
      requiredMonthlyContribution: null,
    };
  }

  const realTargetAmount = roundToCents(
    input.targetBasis === "today_purchasing_power"
      ? input.targetAmount
      : assertFiniteResult(
          input.targetAmount / annualInflationFactor ** input.horizonYears,
        ),
  );

  return {
    ...resultBase,
    mode: input.mode,
    targetBasis: input.targetBasis,
    targetAmount: input.targetAmount,
    monthlyContribution: null,
    requiredMonthlyContribution: requiredContribution!.monthlyAmount,
    nominalTargetAmount: requiredContribution!.nominalTargetAmount,
    realTargetAmount,
  };
}
