import { centsToNumber, decimalToCents } from "@/lib/portfolio-money";

export type EmergencyReserveCalculationInput = {
  monthlyExpenses: number | null;
  monthlyExpensesCents?: string | null;
  essentialMonthlyExpenses?: number | null;
  essentialExpenseSources?: EssentialExpenseSource[];
  targetMonths: number | null;
  selectedValue: number;
  selectedValueCents?: string;
  selectedGroups: number;
  unvaluedGroups: number;
  referenceDate: string | null;
};

export type EssentialExpenseSource = {
  id: string;
  description: string;
  frequency: string;
  amount: number;
  monthlyEquivalent: number;
};

export type EssentialRecurrence = {
  id?: string;
  description: string;
  amount: string;
  frequency: string;
  kind: string;
  essential: boolean;
  active: boolean;
};

const frequencyConfig: Record<
  string,
  { annualOccurrences: bigint; label: string }
> = {
  WEEKLY: { annualOccurrences: 52n, label: "Semanal" },
  BIWEEKLY: { annualOccurrences: 26n, label: "Quinzenal" },
  MONTHLY: { annualOccurrences: 12n, label: "Mensal" },
  BIMONTHLY: { annualOccurrences: 6n, label: "Bimestral" },
  QUARTERLY: { annualOccurrences: 4n, label: "Trimestral" },
  SEMIANNUALLY: { annualOccurrences: 2n, label: "Semestral" },
  YEARLY: { annualOccurrences: 1n, label: "Anual" },
};

export function calculateEssentialMonthlyBaseline(
  recurrences: EssentialRecurrence[],
) {
  const sourceAmounts: Array<{
    source: EssentialExpenseSource;
    monthlyCents: bigint;
    remainder: bigint;
  }> = [];
  let annualTotalCents = 0n;
  let monthlyFloorTotalCents = 0n;

  for (const recurrence of recurrences) {
    const frequency = frequencyConfig[recurrence.frequency];
    if (
      !recurrence.active ||
      !recurrence.essential ||
      recurrence.kind !== "EXPENSE" ||
      frequency === undefined
    ) {
      continue;
    }
    const amountCents = decimalToCents(recurrence.amount);
    if (amountCents === null || amountCents <= 0n) continue;
    const annualCents = amountCents * frequency.annualOccurrences;
    const monthlyCents = annualCents / 12n;
    annualTotalCents += annualCents;
    monthlyFloorTotalCents += monthlyCents;
    sourceAmounts.push({
      source: {
        id:
          recurrence.id ??
          `${recurrence.description}:${recurrence.frequency}:${recurrence.amount}`,
        description: recurrence.description,
        frequency: frequency.label,
        amount: centsToNumber(amountCents)!,
        monthlyEquivalent: 0,
      },
      monthlyCents,
      remainder: annualCents % 12n,
    });
  }

  const totalCents = (annualTotalCents + 6n) / 12n;
  let residualCents = totalCents - monthlyFloorTotalCents;
  const residualOrder = [...sourceAmounts].sort((left, right) =>
    left.remainder === right.remainder
      ? 0
      : left.remainder > right.remainder
        ? -1
        : 1,
  );
  const residualRecipients = new Set(
    residualOrder.slice(0, Number(residualCents)).map((entry) => entry.source),
  );
  const sources = sourceAmounts.map(({ source, monthlyCents }) => {
    const cents = monthlyCents + (residualRecipients.has(source) ? 1n : 0n);
    return { ...source, monthlyEquivalent: centsToNumber(cents)! };
  });

  return {
    monthlyExpenses: totalCents > 0n ? centsToNumber(totalCents) : null,
    monthlyExpensesCents: totalCents.toString(),
    sources,
    method:
      "Média mensal calculada pelo valor anual de cada recorrência dividido por 12.",
  };
}

export type EmergencyReserveCalculation = {
  monthlyExpenses: number | null;
  monthlyExpensesCents?: string | null;
  essentialMonthlyExpenses?: number | null;
  essentialExpenseSources?: EssentialExpenseSource[];
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
  horizons?: Array<{
    months: 3 | 6 | 9 | 12;
    targetValue: number | null;
    targetValueCents: string | null;
    difference: number | null;
    differenceCents: string | null;
  }>;
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
  const expenseCents =
    input.monthlyExpensesCents === undefined
      ? monthlyExpenses === null
        ? null
        : (decimalToCents(monthlyExpenses) ?? 0n)
      : input.monthlyExpensesCents === null
        ? null
        : BigInt(input.monthlyExpensesCents);
  const horizons = ([3, 6, 9, 12] as const).map((months) => {
    if (expenseCents === null || expenseCents <= 0n) {
      return {
        months,
        targetValue: null,
        targetValueCents: null,
        difference: null,
        differenceCents: null,
      };
    }
    const targetCents = expenseCents * BigInt(months);
    const differenceCents = targetCents - selectedValueCents;
    return {
      months,
      targetValue: centsToNumber(targetCents),
      targetValueCents: targetCents.toString(),
      difference: centsToNumber(differenceCents),
      differenceCents: differenceCents.toString(),
    };
  });

  if (monthlyExpenses === null) {
    return {
      ...input,
      horizons,
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

  if (expenseCents === null) {
    return {
      ...input,
      horizons,
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
    const targetCents =
      targetMonths === null || expenseCents === null
        ? null
        : expenseCents * BigInt(targetMonths);
    const targetValue =
      targetCents === null ? null : centsToNumber(targetCents);
    const differenceCents =
      targetCents === null ? null : targetCents - selectedValueCents;
    return {
      ...input,
      horizons,
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

  const coveredMonths =
    expenseCents !== null && expenseCents > 0n
      ? Number(selectedValueCents) / Number(expenseCents)
      : null;
  if (targetMonths === null) {
    return {
      ...input,
      horizons,
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
    horizons,
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
