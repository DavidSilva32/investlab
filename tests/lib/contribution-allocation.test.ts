import { describe, expect, it } from "vitest";
import { calculateContributionAllocation } from "@/lib/contribution-allocation";
import { getEmergencyReserveAssetKey } from "@/lib/emergency-reserve-asset-key";
import { portfolioAssetClassOptions } from "@/lib/portfolio-classification-options";

const position = (overrides: Record<string, unknown> = {}) => ({
  product: "CDB DI",
  assetCode: "CDB-1",
  institution: "Banco A",
  issuer: "Banco A S.A.",
  indexer: "CDI",
  regimeType: "Pós-fixado",
  issuedAt: "2024-01-01",
  maturityAt: "2028-01-01",
  totalValue: "100.00",
  estimatedValue: null,
  classification: { assetClass: "Renda fixa" },
  ...overrides,
});

const targets = Object.fromEntries(
  portfolioAssetClassOptions.map((assetClass) => [
    assetClass,
    assetClass === "Renda fixa" ? 50 : assetClass === "Renda variável" ? 50 : 0,
  ]),
);

const reserve = (overrides: Record<string, unknown> = {}) => ({
  monthlyExpenses: 1000,
  targetMonths: 1,
  selectedValue: 0,
  selectedGroups: 1,
  unvaluedGroups: 0,
  missingSelectionCount: 0,
  referenceDate: "2026-01-01",
  targetValue: 1000,
  coveredMonths: 0,
  difference: 700,
  progressPercentage: 30,
  status: "below_target" as const,
  ...overrides,
});

describe("calculateContributionAllocation", () => {
  it("uses the supplied canonical cents ahead of legacy numeric values", () => {
    const result = calculateContributionAllocation({
      contributionAmount: 0,
      positions: [
        position({ totalValue: "900", canonicalValueCents: "10052" }),
      ],
      targets,
      reserve: reserve({
        status: "not_configured",
        difference: null,
        targetValue: null,
      }),
      selectedReserveAssetKeys: [],
    });

    expect(result.longTermPortfolioValue).toBe(100.52);
  });

  it("treats an explicitly unvalued canonical position as incomplete", () => {
    const result = calculateContributionAllocation({
      contributionAmount: 0,
      positions: [position({ canonicalValueCents: null })],
      targets,
      reserve: reserve({
        status: "not_configured",
        difference: null,
        targetValue: null,
      }),
      selectedReserveAssetKeys: [],
    });

    expect(result).toMatchObject({
      status: "incomplete_data",
      unknownPositionCount: 1,
    });
  });

  it("subtracts the personal reserve gap and excludes reserve positions from long-term totals", () => {
    const heldForReserve = position({
      assetCode: "RESERVE",
      totalValue: "300",
    });
    const result = calculateContributionAllocation({
      contributionAmount: 800,
      positions: [
        heldForReserve,
        position({ assetCode: "LONG-TERM", totalValue: "700" }),
      ],
      targets,
      reserve: reserve(),
      selectedReserveAssetKeys: [getEmergencyReserveAssetKey(heldForReserve)],
    });

    expect(result).toMatchObject({
      status: "ready",
      strategySource: "user_defined",
      contributionAmount: 800,
      reserveAmount: 700,
      remainingAmount: 100,
      reserveStatus: "applied",
      longTermPortfolioValue: 700,
    });
    expect(
      result.allocations.find((row) => row.assetClass === "Renda variável"),
    ).toMatchObject({ contributionAmount: 100, currentValue: 0 });
    expect(result.remainingAmount).not.toBeNull();
    expect(
      result.allocations.reduce((sum, row) => sum + row.contributionAmount, 0),
    ).toBeLessThanOrEqual(result.remainingAmount!);
  });

  it("does not treat the reserve slice as fixed income and caps it at the aporte", () => {
    const result = calculateContributionAllocation({
      contributionAmount: 250,
      positions: [position()],
      targets,
      reserve: reserve(),
      selectedReserveAssetKeys: [],
    });

    expect(result.reserveAmount).toBe(250);
    expect(result.remainingAmount).toBe(0);
    expect(
      result.allocations.every((row) => row.contributionAmount === 0),
    ).toBe(true);
    expect(
      result.allocations.find((row) => row.assetClass === "Renda fixa")
        ?.currentValue,
    ).toBe(100);
  });

  it("splits cents deterministically without exceeding the remaining amount", () => {
    const splitTargets = Object.fromEntries(
      portfolioAssetClassOptions.map((assetClass) => [
        assetClass,
        assetClass === "Renda fixa"
          ? 50
          : assetClass === "Renda variável"
            ? 50
            : 0,
      ]),
    );
    const input = {
      contributionAmount: 10.01,
      positions: [position({ totalValue: "100" })],
      targets: splitTargets,
      reserve: reserve({ status: "on_target", difference: 0 }),
      selectedReserveAssetKeys: [],
    };
    const first = calculateContributionAllocation(input);
    const second = calculateContributionAllocation(input);

    expect(first).toEqual(second);
    expect(
      first.allocations.reduce((sum, row) => sum + row.contributionAmount, 0),
    ).toBeLessThanOrEqual(10.01);
  });

  it("caps remainder cents at each class deficit when gaps are uneven", () => {
    const unevenTargets = Object.fromEntries(
      portfolioAssetClassOptions.map((assetClass) => [
        assetClass,
        assetClass === "Renda fixa" || assetClass === "Fundos"
          ? 1
          : assetClass === "Renda variável"
            ? 0.01
            : assetClass === "Outros"
              ? 97.99
              : 0,
      ]),
    );
    const result = calculateContributionAllocation({
      contributionAmount: 0.02,
      positions: [
        position({
          assetCode: "OVERWEIGHT",
          totalValue: "100",
          classification: { assetClass: "Outros" },
        }),
      ],
      targets: unevenTargets,
      reserve: reserve({ status: "on_target", difference: 0 }),
      selectedReserveAssetKeys: [],
    });
    const fixedIncome = result.allocations.find(
      (row) => row.assetClass === "Renda fixa",
    )!;
    const variableIncome = result.allocations.find(
      (row) => row.assetClass === "Renda variável",
    )!;
    const funds = result.allocations.find(
      (row) => row.assetClass === "Fundos",
    )!;

    expect([
      fixedIncome.targetGapValue,
      variableIncome.targetGapValue,
      funds.targetGapValue,
    ]).toEqual([1, 0.01, 1]);
    expect([
      fixedIncome.contributionAmount,
      variableIncome.contributionAmount,
      funds.contributionAmount,
    ]).toEqual([0.01, 0, 0.01]);
    expect(
      result.allocations.reduce((sum, row) => sum + row.contributionAmount, 0),
    ).toBe(0.02);
    expect(
      result.allocations.every(
        (row) => row.contributionAmount <= row.targetGapValue,
      ),
    ).toBe(true);
  });

  it("handles exact target gaps without creating remainder cents", () => {
    const allFixedIncomeTargets = Object.fromEntries(
      portfolioAssetClassOptions.map((assetClass) => [
        assetClass,
        assetClass === "Renda fixa" ? 100 : 0,
      ]),
    );
    const result = calculateContributionAllocation({
      contributionAmount: 100,
      positions: [position({ totalValue: "100" })],
      targets: allFixedIncomeTargets,
      reserve: reserve({ status: "on_target", difference: 0 }),
      selectedReserveAssetKeys: [],
    });

    expect(result.status).toBe("ready");
    expect(
      result.allocations.find((row) => row.assetClass === "Renda fixa"),
    ).toMatchObject({ targetGapValue: 100, contributionAmount: 100 });
  });

  it("does not show a class split when a long-term position lacks value or classification", () => {
    const result = calculateContributionAllocation({
      contributionAmount: 500,
      positions: [
        position(),
        position({ assetCode: "UNKNOWN", totalValue: null }),
      ],
      targets,
      reserve: reserve({ status: "on_target", difference: 0 }),
      selectedReserveAssetKeys: [],
    });

    expect(result).toMatchObject({
      status: "incomplete_data",
      unknownPositionCount: 1,
      longTermPortfolioValue: null,
    });
    expect(result.allocations).toEqual([]);
  });

  it("blocks allocation when reserve data is incomplete", () => {
    const result = calculateContributionAllocation({
      contributionAmount: 100,
      positions: [position()],
      targets,
      reserve: reserve({ unvaluedGroups: 1 }),
      selectedReserveAssetKeys: [],
    });

    expect(result).toMatchObject({
      reserveAmount: null,
      remainingAmount: null,
      reserveStatus: "incomplete",
      status: "reserve_incomplete",
    });
    expect(result.allocations).toEqual([]);
  });

  it("reports missing targets, empty portfolios, and no-gap cases", () => {
    const base = {
      contributionAmount: 100,
      positions: [position()],
      reserve: reserve({ status: "on_target", difference: 0 }),
      selectedReserveAssetKeys: [],
    };
    expect(
      calculateContributionAllocation({ ...base, targets: {} }).status,
    ).toBe("needs_targets");
    expect(
      calculateContributionAllocation({
        ...base,
        positions: [],
        targets,
      }).status,
    ).toBe("no_positions");
    const noGapTargets = Object.fromEntries(
      portfolioAssetClassOptions.map((assetClass) => [
        assetClass,
        assetClass === "Renda fixa" ? 100 : 0,
      ]),
    );
    expect(
      calculateContributionAllocation({
        ...base,
        contributionAmount: 0,
        targets: noGapTargets,
      }).status,
    ).toBe("no_gap");
    expect(
      calculateContributionAllocation({
        ...base,
        positions: [position({ totalValue: "0" })],
        targets,
      }).status,
    ).toBe("no_positions");
    expect(
      calculateContributionAllocation({
        ...base,
        reserve: reserve({
          targetValue: null,
          difference: null,
          targetMonths: null,
          monthlyExpenses: null,
          status: "not_configured",
        }),
        targets,
      }).reserveStatus,
    ).toBe("not_configured");
    expect(
      calculateContributionAllocation({
        ...base,
        reserve: reserve({ unvaluedGroups: 0, missingSelectionCount: 1 }),
        targets,
      }).status,
    ).toBe("reserve_incomplete");
    expect(
      calculateContributionAllocation({
        ...base,
        reserve: reserve({
          unvaluedGroups: 0,
          missingSelectionCount: undefined,
          status: "on_target",
          difference: 0,
        }),
        targets,
      }).status,
    ).toBe("ready");
    expect(
      calculateContributionAllocation({
        ...base,
        positions: [position({ classification: { assetClass: null } })],
        targets,
      }).status,
    ).toBe("incomplete_data");
  });
});
