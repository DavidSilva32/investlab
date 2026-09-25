export type EmergencyReserveCalculationInput = {
  monthlyExpenses: number | null;
  targetMonths: number | null;
  selectedValue: number;
  selectedGroups: number;
  unvaluedGroups: number;
  referenceDate: string | null;
};

export type EmergencyReserveCalculation = {
  monthlyExpenses: number | null;
  targetMonths: number | null;
  selectedValue: number;
  selectedGroups: number;
  unvaluedGroups: number;
  missingSelectionCount?: number;
  referenceDate: string | null;
  targetValue: number | null;
  coveredMonths: number | null;
  difference: number | null;
  progressPercentage: number | null;
  status:
    | "not_configured"
    | "expenses_required"
    | "below_target"
    | "on_target"
    | "above_target";
};

const cents = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateEmergencyReserve(
  input: EmergencyReserveCalculationInput,
): EmergencyReserveCalculation {
  const selectedValue = cents(Math.max(0, input.selectedValue));
  const monthlyExpenses = input.monthlyExpenses;
  const targetMonths = input.targetMonths;

  if (monthlyExpenses === null || targetMonths === null) {
    return {
      ...input,
      selectedValue,
      targetValue: null,
      coveredMonths: null,
      difference: null,
      progressPercentage: null,
      status: "not_configured",
    };
  }

  const targetValue = cents(monthlyExpenses * targetMonths);
  if (monthlyExpenses <= 0) {
    return {
      ...input,
      selectedValue,
      targetValue,
      coveredMonths: null,
      difference: targetValue - selectedValue,
      progressPercentage: null,
      status: "expenses_required",
    };
  }

  const difference = cents(targetValue - selectedValue);
  const epsilon = 0.005;
  const status =
    difference > epsilon
      ? "below_target"
      : difference < -epsilon
        ? "above_target"
        : "on_target";

  return {
    ...input,
    selectedValue,
    targetValue,
    coveredMonths: selectedValue / monthlyExpenses,
    difference,
    progressPercentage:
      targetValue > 0
        ? Math.min(100, (selectedValue / targetValue) * 100)
        : null,
    status,
  };
}
