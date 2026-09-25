import { describe, expect, it } from "vitest";
import {
  getNextContributionGuidance,
  type ContributionGuidancePosition,
} from "@/lib/next-contribution-guidance";
import { portfolioAssetClassOptions } from "@/lib/portfolio-classification-options";
import type { EmergencyReserveCalculation } from "@/lib/emergency-reserve";

const targets = Object.fromEntries(
  portfolioAssetClassOptions.map((assetClass) => [
    assetClass,
    assetClass === "Renda fixa" ? 60 : 8,
  ]),
);
const position = (
  assetClass: string | null,
  totalValue: string | null = "30",
  estimatedValue?: number | null,
): ContributionGuidancePosition => ({
  totalValue,
  estimatedValue,
  classification: { assetClass },
});
const reserve = (
  overrides: Partial<EmergencyReserveCalculation> = {},
): EmergencyReserveCalculation => ({
  monthlyExpenses: 1000,
  targetMonths: 3,
  selectedValue: 1000,
  selectedGroups: 1,
  unvaluedGroups: 0,
  missingSelectionCount: 0,
  referenceDate: "2026-09-01",
  targetValue: 3000,
  coveredMonths: 1,
  difference: 2000,
  progressPercentage: 33.3,
  status: "below_target",
  ...overrides,
});

describe("getNextContributionGuidance", () => {
  it("prioritizes a complete user-defined reserve gap", () => {
    expect(
      getNextContributionGuidance({
        positions: [position("Renda fixa")],
        targets,
        emergencyReserve: reserve(),
      }),
    ).toMatchObject({ status: "reserve_below_target" });
  });
  it.each([
    { unvaluedGroups: 1, missingSelectionCount: 0 },
    { unvaluedGroups: 0, missingSelectionCount: 1 },
  ])("does not overstate an incomplete reserve gap", (incomplete) =>
    expect(
      getNextContributionGuidance({
        positions: [position("Renda fixa")],
        targets,
        emergencyReserve: reserve(incomplete),
      }),
    ).toMatchObject({ status: "reserve_incomplete" }),
  );
  it("states when the reserve is not configured", () => {
    expect(
      getNextContributionGuidance({
        positions: [
          position("Renda variável", "70"),
          position("Renda fixa", "30"),
        ],
        targets,
        emergencyReserve: reserve({
          status: "not_configured",
          difference: null,
        }),
      }),
    ).toMatchObject({
      status: "target_gap",
      assetClass: "Renda fixa",
      reserveNote: expect.stringContaining("não está configurada"),
    });
  });
  it("states when reserve expenses are required", () => {
    expect(
      getNextContributionGuidance({
        positions: [position("Renda fixa")],
        targets,
        emergencyReserve: reserve({
          status: "expenses_required",
          difference: null,
        }),
      }).reserveNote,
    ).toContain("custo mensal válido");
  });
  it("requires imported positions and positive values", () => {
    expect(
      getNextContributionGuidance({ positions: [], targets }),
    ).toMatchObject({ status: "needs_values" });
    expect(
      getNextContributionGuidance({
        positions: [position("Renda fixa", "0")],
        targets,
      }),
    ).toMatchObject({ status: "needs_values" });
  });
  it("requires a valid set of personal targets", () => {
    expect(
      getNextContributionGuidance({
        positions: [position("Renda fixa")],
        targets: {},
      }),
    ).toMatchObject({ status: "needs_targets" });
  });
  const incompletePositionCases: [ContributionGuidancePosition[]][] = [
    [[position(null)]],
    [[position("Unknown")]],
    [[position("Renda fixa", null)]],
    [[position("Renda fixa", "30", Number.NaN)]],
    [[position("Renda fixa", "30", -1)]],
  ];
  it.each(incompletePositionCases)(
    "does not choose a class with incomplete portfolio data",
    (positions) =>
      expect(getNextContributionGuidance({ positions, targets })).toMatchObject(
        {
          status: "incomplete_data",
        },
      ),
  );
  it("uses estimates when present and reported values as fallback", () => {
    expect(
      getNextContributionGuidance({
        positions: [
          position("Renda variável", "70", null),
          position("Renda fixa", "30", 30),
        ],
        targets,
      }),
    ).toMatchObject({ status: "target_gap", assetClass: "Renda fixa" });
    const guidance = getNextContributionGuidance({
      positions: [
        position("Renda variável", "70"),
        position("Renda fixa", "30"),
      ],
      targets,
    });
    expect(guidance.explanation).toContain(
      "Renda fixa representa 30.0% da carteira",
    );
    expect(guidance.explanation).toContain("sua meta pessoal é 60.0%");
  });
  it("explains the selected class using its current share and personal target", () => {
    const details = getNextContributionGuidance({
      positions: [
        position(portfolioAssetClassOptions[1]!, "70"),
        position("Renda fixa", "30"),
      ],
      targets,
    });
    expect(details.explanation).toContain(
      "Renda fixa representa 30.0% da carteira",
    );
    expect(details.explanation).toContain("sua meta pessoal é 60.0%");
  });

  it("compares a class with no current positions against its unique personal target gap", () => {
    const targetClass = portfolioAssetClassOptions[1]!;
    const absentClassTargets = Object.fromEntries(
      portfolioAssetClassOptions.map((assetClass) => [
        assetClass,
        assetClass === "Renda fixa"
          ? 40
          : assetClass === targetClass
            ? 30
            : 7.5,
      ]),
    );
    const guidance = getNextContributionGuidance({
      positions: [position("Renda fixa", "100")],
      targets: absentClassTargets,
    });

    expect(guidance).toMatchObject({
      status: "target_gap",
      assetClass: targetClass,
      currentPercentage: 0,
      targetPercentage: 30,
    });
    expect(guidance.explanation).toContain(
      `${targetClass} representa 0.0% da carteira`,
    );
    expect(guidance.explanation).toContain("sua meta pessoal");
    expect(guidance.explanation).toContain("30.0%");
  });

  it("does not choose a priority on a tie", () => {
    const equalTargets = Object.fromEntries(
      portfolioAssetClassOptions.map((assetClass) => [
        assetClass,
        assetClass === "Renda fixa" || assetClass === "Fundos" ? 20 : 15,
      ]),
    );
    expect(
      getNextContributionGuidance({
        positions: [position("Renda fixa", "50"), position("Fundos", "50")],
        targets: equalTargets,
      }),
    ).toMatchObject({ status: "tie" });
  });
  it("reports when no class is under its target", () => {
    const allFixed = Object.fromEntries(
      portfolioAssetClassOptions.map((assetClass) => [
        assetClass,
        assetClass === "Renda fixa" ? 100 : 0,
      ]),
    );
    expect(
      getNextContributionGuidance({
        positions: [position("Renda fixa", "100")],
        targets: allFixed,
        emergencyReserve: reserve({ status: "on_target", difference: 0 }),
      }),
    ).toMatchObject({ status: "no_gap" });
  });
  it.each([null, 0])(
    "does not prioritize a reserve without a positive difference",
    (difference) => {
      expect(
        getNextContributionGuidance({
          positions: [position("Renda fixa")],
          targets,
          emergencyReserve: reserve({ difference }),
        }).status,
      ).not.toBe("reserve_below_target");
    },
  );
});
