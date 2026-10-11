import { describe, expect, it } from "vitest";
import {
  getPortfolioDiagnostics,
  type PortfolioDiagnosticsInput,
} from "@/lib/portfolio-diagnostics";
import { getPortfolioInsights } from "@/lib/portfolio-insights";
import { getPortfolioConcentration } from "@/lib/portfolio-concentration";
import { calculateEmergencyReserve } from "@/lib/emergency-reserve";

function input(
  overrides: Partial<PortfolioDiagnosticsInput> = {},
): PortfolioDiagnosticsInput {
  return {
    insights: getPortfolioInsights([]),
    classificationStatus: "loaded",
    classDistribution: getPortfolioConcentration([], "assetClass"),
    ...overrides,
  };
}
const reserve = calculateEmergencyReserve({
  monthlyExpenses: 1000,
  targetMonths: 6,
  selectedValue: 0,
  selectedGroups: 0,
  unvaluedGroups: 0,
  referenceDate: "2000-01-01",
});
const guidance = {
  status: "target_gap" as const,
  title: "Meta",
  explanation: "Diferença em relação à composição pessoal.",
  assetClass: "Ações",
  currentPercentage: 10,
  targetPercentage: 20,
};

describe("getPortfolioDiagnostics", () => {
  it("opens the comparison corresponding to the canonical allocation mode", () => {
    expect(
      getPortfolioDiagnostics(
        input({
          nextContributionGuidance: { ...guidance, allocationMode: "legacy" },
        }),
      ),
    ).toMatchObject([
      {
        id: "allocation",
        action: "classification",
        href: "/portfolio?panel=classification",
      },
    ]);
    expect(
      getPortfolioDiagnostics(
        input({
          nextContributionGuidance: { ...guidance, allocationMode: "strategy" },
        }),
      ),
    ).toMatchObject([
      { id: "allocation", action: "strategy", href: "/strategy" },
    ]);
  });
  it("is discreet with an empty portfolio, missing goals and dates without a freshness policy", () => {
    expect(getPortfolioDiagnostics(input())).toEqual([]);
    for (const status of [
      "needs_targets",
      "needs_values",
      "no_gap",
      "tie",
      "unavailable",
      "incomplete_data",
    ] as const) {
      expect(
        getPortfolioDiagnostics(
          input({
            emergencyReserve: reserve,
            nextContributionGuidance: { ...guidance, status },
          }),
        ),
      ).toEqual([]);
    }
  });

  it("presents canonical limitations in impact order without mutation", () => {
    const data = input({
      insights: {
        ...getPortfolioInsights([]),
        unvaluedPositions: 2,
        provisionalEstimates: 1,
        unavailableEstimates: 3,
        upcomingMaturities: [
          { product: "CDB", maturityAt: "2030-01-31", value: null },
        ],
      },
      classDistribution: {
        ...getPortfolioConcentration([], "assetClass"),
        unclassifiedPositions: 2,
      },
      emergencyReserve: { ...reserve, missingSelectionCount: 1 },
      nextContributionGuidance: guidance,
    });
    const original = structuredClone(data);
    const rows = getPortfolioDiagnostics(data);
    expect(rows.map(({ id }) => id)).toEqual([
      "values",
      "estimates",
      "classification",
      "reserve",
      "allocation",
      "maturity",
    ]);
    expect(rows.slice(0, 3).map(({ count }) => count)).toEqual([2, 4, 2]);
    expect(rows.find(({ id }) => id === "classification")).toMatchObject({
      action: "classification",
      severity: "missing",
    });
    expect(
      rows.find(({ id }) => id === "classification")?.href,
    ).toBeUndefined();
    expect(rows.find(({ id }) => id === "reserve")?.href).toBe(
      "/portfolio?panel=objectives&objective=reserve",
    );
    expect(rows.find(({ id }) => id === "allocation")).toMatchObject({
      severity: "information",
      href: "/strategy",
      detail: guidance.explanation,
    });
    expect(rows.find(({ id }) => id === "maturity")?.detail).toContain(
      "31/01/2030",
    );
    expect(rows.find(({ id }) => id === "values")?.href).toBe(
      "/portfolio?view=positions",
    );
    expect(getPortfolioDiagnostics(data)).toEqual(rows);
    expect(data).toEqual(original);
  });

  it("groups provisional-only and unavailable-only estimates", () => {
    for (const estimates of [
      { provisionalEstimates: 1, unavailableEstimates: 0 },
      { provisionalEstimates: 0, unavailableEstimates: 1 },
    ]) {
      expect(
        getPortfolioDiagnostics(
          input({ insights: { ...getPortfolioInsights([]), ...estimates } }),
        ),
      ).toMatchObject([{ id: "estimates", count: 1 }]);
    }
  });

  it("never confuses unloaded classification with absent classification", () => {
    const distribution = {
      ...getPortfolioConcentration([], "assetClass"),
      unclassifiedPositions: 1,
    };
    for (const classificationStatus of ["loading", "unavailable"] as const) {
      expect(
        getPortfolioDiagnostics(
          input({ classificationStatus, classDistribution: distribution }),
        ),
      ).toEqual([]);
    }
    expect(getPortfolioDiagnostics(input({ classDistribution: null }))).toEqual(
      [],
    );
  });

  it("only shows reserve coverage limitations proven by its canonical summary", () => {
    expect(
      getPortfolioDiagnostics(
        input({ emergencyReserve: { ...reserve, unvaluedGroups: 1 } }),
      ),
    ).toMatchObject([{ id: "reserve" }]);
    const { missingSelectionCount: _missing, ...withoutOptionalCount } = {
      ...reserve,
      missingSelectionCount: 0,
    };
    expect(
      getPortfolioDiagnostics(
        input({ emergencyReserve: withoutOptionalCount }),
      ),
    ).toEqual([]);
  });

  it("requires an identified class and finite canonical target percentages", () => {
    for (const nextContributionGuidance of [
      { ...guidance, assetClass: undefined },
      { ...guidance, currentPercentage: undefined },
      { ...guidance, currentPercentage: Number.NaN },
      { ...guidance, targetPercentage: Number.POSITIVE_INFINITY },
    ]) {
      expect(
        getPortfolioDiagnostics(input({ nextContributionGuidance })),
      ).toEqual([]);
    }
  });

  it("ignores malformed maturity dates instead of inventing a date", () => {
    for (const maturityAt of ["bad", "2026-99-01", "2026-02-31"]) {
      expect(
        getPortfolioDiagnostics(
          input({
            insights: {
              ...getPortfolioInsights([]),
              upcomingMaturities: [{ product: "CDB", maturityAt, value: 0 }],
            },
          }),
        ),
      ).toEqual([]);
    }
  });

  it("does not flag mixed or old reference dates and legitimately unassigned positions", () => {
    for (const referenceDates of [
      ["2000-01-01"],
      ["2026-01-01", "2026-06-01"],
    ]) {
      expect(
        getPortfolioDiagnostics(
          input({
            classDistribution: {
              ...getPortfolioConcentration([], "assetClass"),
              referenceDates,
            },
          }),
        ),
      ).toEqual([]);
    }
  });
});
