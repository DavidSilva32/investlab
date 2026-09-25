import { describe, expect, it } from "vitest";
import { calculateEmergencyReserve } from "@/lib/emergency-reserve";

const base = {
  monthlyExpenses: 1000,
  targetMonths: 6,
  selectedValue: 3000,
  selectedGroups: 2,
  unvaluedGroups: 0,
  referenceDate: "2026-09-01",
};

describe("calculateEmergencyReserve", () => {
  it("does not calculate coverage before the user configures a target", () => {
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

  it("requires a positive monthly cost to calculate covered months", () => {
    const result = calculateEmergencyReserve({ ...base, monthlyExpenses: 0 });

    expect(result).toMatchObject({
      targetValue: 0,
      coveredMonths: null,
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
});
