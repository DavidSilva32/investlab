import { beforeEach, describe, expect, it, vi } from "vitest";

const projectionMock = vi.hoisted(() => ({ throwUnexpected: false }));
vi.mock("@/lib/objective-projection", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/objective-projection")>();
  return {
    ...actual,
    simulateObjectiveProjection: (
      input: Parameters<typeof actual.simulateObjectiveProjection>[0],
    ) => {
      if (projectionMock.throwUnexpected) throw new TypeError("unexpected");
      return actual.simulateObjectiveProjection(input);
    },
  };
});
import { ApplicationError } from "@/backend/errors/application-error";
import { ObjectiveProjectionService } from "@/backend/services/objective-projection.service";

const service = new ObjectiveProjectionService();

function input(overrides: Record<string, unknown> = {}) {
  return {
    mode: "project_balance",
    targetBasis: "future_nominal",
    startingAmount: 1_000,
    targetAmount: 5_000,
    horizonYears: 1,
    annualReturnPercent: 0,
    annualInflationPercent: 0,
    monthlyContribution: 100,
    adjustContributionsForInflation: false,
    ...overrides,
  };
}

describe("ObjectiveProjectionService", () => {
  beforeEach(() => {
    projectionMock.throwUnexpected = false;
  });

  it("projects nominal and real balances with annual contribution adjustments", () => {
    const result = service.simulate(
      input({
        horizonYears: 2,
        targetBasis: "today_purchasing_power",
        targetAmount: 5_000,
        annualInflationPercent: 10,
        adjustContributionsForInflation: true,
      }),
    );

    expect(result.projectedNominalAmount).toBe(3_520);
    expect(result.projectedPurchasingPowerAmount).toBe(2_909.09);
    expect(result.totalInvestedAmount).toBe(3_520);
    expect(result.nominalGrowthAmount).toBe(0);
    expect(result.nominalTargetAmount).toBe(6_050);
    expect(result.realTargetAmount).toBe(5_000);
    expect(result.points).toHaveLength(3);
    expect(result.points[1]).toMatchObject({
      year: 1,
      nominalAmount: 2_200,
      purchasingPowerAmount: 2_000,
    });
    expect(result.contributionTiming).toBe("end_of_month");
  });

  it("stops at the first completion month and caps the final contribution", () => {
    const result = service.simulate(
      input({
        startingAmount: 1_000,
        targetAmount: 1_250,
        horizonYears: 10,
        monthlyContribution: 200,
      }),
    );

    expect(result.targetReachedMonth).toBe(2);
    expect(result.projectedNominalAmount).toBe(1_250);
    expect(result.totalInvestedAmount).toBe(1_250);
    expect(result.points).toHaveLength(2);
    expect(result.points[1]).toMatchObject({
      year: 2 / 12,
      investedAmount: 1_250,
      nominalAmount: 1_250,
    });
  });

  it("stops with no contribution when growth alone reaches the goal", () => {
    const result = service.simulate(
      input({
        startingAmount: 990,
        targetAmount: 1_000,
        monthlyContribution: 0,
        annualReturnPercent: 12,
      }),
    );

    expect(result.targetReachedMonth).toBe(2);
    expect(result.projectedNominalAmount).toBeGreaterThan(1_000);
    expect(result.projectedNominalAmount).toBeCloseTo(1_008.88, 2);
    expect(result.totalInvestedAmount).toBe(990);
  });

  it("marks a goal already covered by the initial balance at month zero", () => {
    const result = service.simulate(
      input({ startingAmount: 1_200, targetAmount: 1_000 }),
    );

    expect(result.targetReachedMonth).toBe(0);
    expect(result.points).toHaveLength(1);
    expect(result.totalInvestedAmount).toBe(1_200);
  });

  it("inflates a present purchasing-power goal month by month", () => {
    const result = service.simulate(
      input({
        targetBasis: "today_purchasing_power",
        startingAmount: 900,
        targetAmount: 1_000,
        horizonYears: 1,
        monthlyContribution: 20,
        annualInflationPercent: 12,
      }),
    );

    expect(result.targetReachedMonth).toBe(10);
    expect(result.points.at(-1)).toMatchObject({
      year: 10 / 12,
      nominalAmount: 1_099.04,
      nominalTargetAmount: 1_099.04,
      realTargetAmount: 1_000,
    });
    expect(result.projectedPurchasingPowerAmount).toBe(1_000);
  });

  it("keeps an unreached project_balance scenario through the full horizon", () => {
    const result = service.simulate(
      input({
        startingAmount: 0,
        targetAmount: 5_000,
        monthlyContribution: 100,
      }),
    );

    expect(result.targetReachedMonth).toBeNull();
    expect(result.points).toHaveLength(2);
    expect(result.points.at(-1)?.year).toBe(1);
  });

  it("finds the monthly contribution needed for a future nominal target", () => {
    const result = service.simulate(
      input({
        mode: "required_contribution",
        targetAmount: 1_300,
        monthlyContribution: null,
      }),
    );

    expect(result.requiredMonthlyContribution).toBe(25);
    expect(result.targetReachedMonth).toBeNull();
    expect(result.projectedNominalAmount).toBe(1_300);
    expect(result.projectedPurchasingPowerAmount).toBe(1_300);
    expect(result.totalInvestedAmount).toBe(1_300);
  });

  it("rounds the required monthly contribution upward so the target remains reachable", () => {
    const result = service.simulate(
      input({
        mode: "required_contribution",
        startingAmount: 1_000,
        targetAmount: 1_000.01,
        monthlyContribution: null,
      }),
    );

    expect(result.requiredMonthlyContribution).toBe(0.01);
    expect(result.projectedNominalAmount).toBeGreaterThanOrEqual(1_000.01);
  });

  it("converts a present purchasing-power target and reports its real equivalent", () => {
    const result = service.simulate(
      input({
        mode: "required_contribution",
        targetBasis: "today_purchasing_power",
        targetAmount: 1_000,
        horizonYears: 2,
        annualInflationPercent: 5,
        monthlyContribution: null,
      }),
    );

    expect(result.nominalTargetAmount).toBe(1_102.5);
    expect(result.realTargetAmount).toBe(1_000);
    expect(result.projectedNominalAmount).toBeGreaterThanOrEqual(1_102.5);
    expect(result.projectedPurchasingPowerAmount).toBeGreaterThanOrEqual(1_000);
  });

  it("returns zero required contribution when the starting balance already covers the target", () => {
    const result = service.simulate(
      input({
        mode: "required_contribution",
        startingAmount: 2_000,
        targetAmount: 1_000,
        monthlyContribution: null,
      }),
    );

    expect(result.requiredMonthlyContribution).toBe(0);
  });

  it("rejects malformed assumptions with a client-safe application error", () => {
    expect(() => service.simulate(input({ horizonYears: 0 }))).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
    expect(() => service.simulate(input({ mode: "unknown" }))).toThrow(
      ApplicationError,
    );
  });

  it("rejects assumptions whose deflation would exceed the numeric range", () => {
    expect(() =>
      service.simulate(
        input({
          targetBasis: "future_nominal",
          horizonYears: 100,
          annualInflationPercent: -99.999,
        }),
      ),
    ).toThrow(ApplicationError);
  });

  it("rethrows unexpected calculation failures for server error handling", () => {
    projectionMock.throwUnexpected = true;
    expect(() => service.simulate(input())).toThrow("unexpected");
  });
});
