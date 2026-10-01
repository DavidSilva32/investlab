import { describe, expect, it } from "vitest";
import { estimatePostFixedCdb } from "@/backend/services/cdb-cdi-estimator";

describe("estimatePostFixedCdb", () => {
  it("capitalizes each CDI business-day rate by the configured percentage", () => {
    const result = estimatePostFixedCdb({
      officialValue: "8108.14",
      cdiPercentage: "100",
      rates: [{ annualRate: "14.9" }, { annualRate: "14.9" }],
    });
    const daily = (1 + 0.149) ** (1 / 252) - 1;
    expect(result.estimatedValue).toBe(
      Number((8108.14 * (1 + daily) ** 2).toFixed(8)),
    );
    expect(result.estimatedValueCents).toMatch(/^\d+$/);
  });

  it("applies the contracted CDI percentage instead of assuming 100%", () => {
    const full = estimatePostFixedCdb({
      officialValue: "1000",
      cdiPercentage: "100",
      rates: [{ annualRate: "12" }],
    });
    const boosted = estimatePostFixedCdb({
      officialValue: "1000",
      cdiPercentage: "110",
      rates: [{ annualRate: "12" }],
    });
    expect(boosted.estimatedValue).toBeGreaterThan(full.estimatedValue);
  });

  it("rounds each position to its cent half-up using Decimal", () => {
    expect(
      estimatePostFixedCdb({
        officialValue: "1.005",
        cdiPercentage: "100",
        rates: [],
      }),
    ).toEqual({ estimatedValue: 1.005, estimatedValueCents: "101" });
  });
});
