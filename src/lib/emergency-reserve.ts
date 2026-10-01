import { centsToNumber, decimalToCents } from "@/lib/portfolio-money";

export type EmergencyReserveCalculationInput = {
  monthlyExpenses: number | null;
  targetMonths: number | null;
  selectedValue: number;
  selectedValueCents?: string;
  selectedGroups: number;
  unvaluedGroups: number;
  referenceDate: string | null;
};

export type EmergencyReserveCalculation = {
  monthlyExpenses: number | null;
  targetMonths: number | null;
  selectedValue: number;
  selectedValueCents?: string;
  selectedGroups: number;
  unvaluedGroups: number;
  missingSelectionCount?: number;
  referenceDate: string | null;
  targetValue: number | null;
  targetValueCents?: string | null;
  coveredMonths: number | null;
  difference: number | null;
  differenceCents?: string | null;
  progressPercentage: number | null;
  status:
    | "not_configured"
    | "expenses_required"
    | "below_target"
    | "on_target"
    | "above_target";
};

export function calculateEmergencyReserve(
  input: EmergencyReserveCalculationInput,
): EmergencyReserveCalculation {
  const parsedSelectedCents = input.selectedValueCents
    ? BigInt(input.selectedValueCents)
    : (decimalToCents(input.selectedValue) ?? 0n);
  const selectedValueCents =
    parsedSelectedCents > 0n ? parsedSelectedCents : 0n;
  const selectedValue = centsToNumber(selectedValueCents)!;
  const monthlyExpenses = input.monthlyExpenses;
  const targetMonths = input.targetMonths;

  if (monthlyExpenses === null) {
    return {
      ...input,
      selectedValue,
      selectedValueCents: selectedValueCents.toString(),
      targetValue: null,
      targetValueCents: null,
      coveredMonths: null,
      difference: null,
      differenceCents: null,
      progressPercentage: null,
      status: "not_configured",
    };
  }

  if (monthlyExpenses <= 0) {
    const expenseCents = decimalToCents(monthlyExpenses) ?? 0n;
    const targetCents =
      targetMonths === null ? null : expenseCents * BigInt(targetMonths);
    const targetValue =
      targetCents === null ? null : centsToNumber(targetCents);
    const differenceCents =
      targetCents === null ? null : targetCents - selectedValueCents;
    return {
      ...input,
      selectedValue,
      selectedValueCents: selectedValueCents.toString(),
      targetValue,
      targetValueCents: targetCents?.toString() ?? null,
      coveredMonths: null,
      difference:
        differenceCents === null ? null : centsToNumber(differenceCents),
      differenceCents: differenceCents?.toString() ?? null,
      progressPercentage: null,
      status: "expenses_required",
    };
  }

  const expenseCents = decimalToCents(monthlyExpenses) ?? 0n;
  const coveredMonths =
    expenseCents > 0n
      ? Number(selectedValueCents) / Number(expenseCents)
      : null;
  if (targetMonths === null) {
    return {
      ...input,
      selectedValue,
      selectedValueCents: selectedValueCents.toString(),
      targetValue: null,
      targetValueCents: null,
      coveredMonths,
      difference: null,
      differenceCents: null,
      progressPercentage: null,
      status: "not_configured",
    };
  }

  const targetCents = expenseCents * BigInt(targetMonths);
  const targetValue = centsToNumber(targetCents)!;
  const differenceCents = targetCents - selectedValueCents;
  const difference = centsToNumber(differenceCents)!;
  const status =
    differenceCents > 0n
      ? "below_target"
      : differenceCents < 0n
        ? "above_target"
        : "on_target";

  return {
    ...input,
    selectedValue,
    selectedValueCents: selectedValueCents.toString(),
    targetValue,
    targetValueCents: targetCents.toString(),
    coveredMonths,
    difference,
    differenceCents: differenceCents.toString(),
    progressPercentage:
      targetCents > 0n
        ? Math.min(
            100,
            (Number(selectedValueCents) / Number(targetCents)) * 100,
          )
        : null,
    status,
  };
}
