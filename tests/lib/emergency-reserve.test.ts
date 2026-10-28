import { describe, expect, it } from "vitest";
import {
  calculateEmergencyReserve,
  calculateEssentialMonthlyBaseline,
} from "@/lib/emergency-reserve";

const base = {
  monthlyExpenses: 1000,
  targetMonths: 6,
  selectedValue: 3000,
  selectedGroups: 2,
  unvaluedGroups: 0,
  referenceDate: "2026-09-01",
};

describe("calculateEmergencyReserve", () => {
  it("averages essential expenses over a year with cent-accurate frequency conversion", () => {
    const baseline = calculateEssentialMonthlyBaseline([
      {
        description: "Luz",
        amount: "100.00",
        frequency: "MONTHLY",
        kind: "EXPENSE",
        essential: true,
        active: true,
      },
      {
        description: "Seguro anual",
        amount: "120.00",
        frequency: "YEARLY",
        kind: "EXPENSE",
        essential: true,
        active: true,
      },
      {
        description: "Compra semanal",
        amount: "10.00",
        frequency: "WEEKLY",
        kind: "EXPENSE",
        essential: true,
        active: true,
      },
      {
        description: "Internet",
        amount: "50.00",
        frequency: "MONTHLY",
        kind: "EXPENSE",
        essential: false,
        active: true,
      },
      {
        description: "Salário",
        amount: "5000.00",
        frequency: "MONTHLY",
        kind: "INCOME",
        essential: true,
        active: true,
      },
      {
        description: "Aluguel encerrado",
        amount: "700.00",
        frequency: "MONTHLY",
        kind: "EXPENSE",
        essential: true,
        active: false,
      },
      {
        description: "Frequência futura",
        amount: "20.00",
        frequency: "UNKNOWN",
        kind: "EXPENSE",
        essential: true,
        active: true,
      },
    ]);

    expect(baseline).toMatchObject({
      monthlyExpenses: 153.33,
      monthlyExpensesCents: "15333",
      sources: [
        { description: "Luz", monthlyEquivalent: 100 },
        { description: "Seguro anual", monthlyEquivalent: 10 },
        { description: "Compra semanal", monthlyEquivalent: 43.33 },
      ],
    });
  });

  it.each([
    ["BIWEEKLY", "60.00", 130],
    ["BIMONTHLY", "120.00", 60],
    ["QUARTERLY", "300.00", 100],
    ["SEMIANNUALLY", "600.00", 100],
  ])(
    "converts %s recurrences to an annual monthly average",
    (frequency, amount, monthlyEquivalent) => {
      expect(
        calculateEssentialMonthlyBaseline([
          {
            description: "Despesa",
            amount,
            frequency,
            kind: "EXPENSE",
            essential: true,
            active: true,
          },
        ]).monthlyExpenses,
      ).toBe(monthlyEquivalent);
    },
  );

  it("rounds the aggregated monthly baseline once and allocates displayed cents consistently", () => {
    const baseline = calculateEssentialMonthlyBaseline([
      {
        description: "Despesa A",
        amount: "0.01",
        frequency: "WEEKLY",
        kind: "EXPENSE",
        essential: true,
        active: true,
      },
      {
        description: "Despesa B",
        amount: "0.01",
        frequency: "WEEKLY",
        kind: "EXPENSE",
        essential: true,
        active: true,
      },
    ]);

    expect(baseline.monthlyExpenses).toBe(0.09);
    expect(
      baseline.sources.reduce(
        (sum, source) => sum + source.monthlyEquivalent,
        0,
      ),
    ).toBe(0.09);
  });

  it("shows 3, 6, 9, and 12 month targets from the selected monthly cost", () => {
    expect(calculateEmergencyReserve(base).horizons).toEqual([
      {
        months: 3,
        targetValue: 3000,
        targetValueCents: "300000",
        difference: 0,
        differenceCents: "0",
      },
      {
        months: 6,
        targetValue: 6000,
        targetValueCents: "600000",
        difference: 3000,
        differenceCents: "300000",
      },
      {
        months: 9,
        targetValue: 9000,
        targetValueCents: "900000",
        difference: 6000,
        differenceCents: "600000",
      },
      {
        months: 12,
        targetValue: 12000,
        targetValueCents: "1200000",
        difference: 9000,
        differenceCents: "900000",
      },
    ]);
  });

  it("does not calculate coverage before monthly expenses are configured", () => {
    const result = calculateEmergencyReserve({
      ...base,
      monthlyExpenses: null,
      targetMonths: null,
    });

    expect(result).toMatchObject({
      selectedValue: 3000,
      targetValue: null,
      coveredMonths: null,
      difference: null,
      status: "not_configured",
    });
  });

  it("calculates coverage from known reserve value without a personal target", () => {
    const result = calculateEmergencyReserve({
      ...base,
      targetMonths: null,
    });

    expect(result).toMatchObject({
      targetValue: null,
      coveredMonths: 3,
      difference: null,
      progressPercentage: null,
      status: "not_configured",
    });
  });

  it("requires a positive monthly cost to calculate covered months", () => {
    const result = calculateEmergencyReserve({ ...base, monthlyExpenses: 0 });

    expect(result).toMatchObject({
      targetValue: 0,
      coveredMonths: null,
      status: "expenses_required",
    });
  });

  it("does not divide by zero when expenses are invalid and there is no target", () => {
    const result = calculateEmergencyReserve({
      ...base,
      monthlyExpenses: 0,
      targetMonths: null,
    });

    expect(result).toMatchObject({
      targetValue: null,
      coveredMonths: null,
      difference: null,
      status: "expenses_required",
    });
  });

  it("calculates personal target, coverage, and remaining amount", () => {
    expect(calculateEmergencyReserve(base)).toMatchObject({
      targetValue: 6000,
      coveredMonths: 3,
      difference: 3000,
      progressPercentage: 50,
      status: "below_target",
    });
  });

  it("recognizes a target met within currency rounding tolerance", () => {
    const result = calculateEmergencyReserve({
      ...base,
      selectedValue: 5999.999,
    });

    expect(result).toMatchObject({
      selectedValue: 6000,
      difference: 0,
      status: "on_target",
    });
  });

  it("caps progress at the configured target and reports an excess", () => {
    const result = calculateEmergencyReserve({ ...base, selectedValue: 9000 });

    expect(result).toMatchObject({
      coveredMonths: 9,
      difference: -3000,
      progressPercentage: 100,
      status: "above_target",
    });
  });

  it("omits percentage progress when the configured target is zero", () => {
    const result = calculateEmergencyReserve({
      ...base,
      targetMonths: 0,
      selectedValue: 0,
    });

    expect(result.targetValue).toBe(0);
    expect(result.progressPercentage).toBeNull();
  });

  it("prevents negative values from reducing the reserve", () => {
    const result = calculateEmergencyReserve({ ...base, selectedValue: -100 });

    expect(result.selectedValue).toBe(0);
    expect(result.difference).toBe(6000);
  });

  it("prefers explicit canonical cents and handles expenses that round to zero cents", () => {
    expect(
      calculateEmergencyReserve({
        ...base,
        selectedValue: 999,
        selectedValueCents: "1250",
      }),
    ).toMatchObject({ selectedValue: 12.5, selectedValueCents: "1250" });

    expect(
      calculateEmergencyReserve({
        ...base,
        monthlyExpenses: 0.001,
        targetMonths: 1,
      }),
    ).toMatchObject({
      coveredMonths: null,
      targetValue: 0,
      status: "above_target",
    });
  });

  it("safely maps non-finite legacy numbers to zero cents", () => {
    expect(
      calculateEmergencyReserve({
        ...base,
        selectedValue: Number.NaN,
        monthlyExpenses: Number.NaN,
        targetMonths: 1,
      }),
    ).toMatchObject({
      selectedValue: 0,
      selectedValueCents: "0",
      targetValue: 0,
      targetValueCents: "0",
      coveredMonths: null,
      status: "on_target",
    });

    expect(
      calculateEmergencyReserve({
        ...base,
        monthlyExpenses: Number.NEGATIVE_INFINITY,
      }),
    ).toMatchObject({
      targetValue: 0,
      targetValueCents: "0",
      status: "expenses_required",
    });
  });
});
