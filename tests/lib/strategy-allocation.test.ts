import { describe, expect, it } from "vitest";
import {
  getStrategyAssetClassColor,
  neutralAssetClassColor,
  strategyAssetClassById,
  strategyAssetClasses,
  simulateStrategyContribution,
} from "@/lib/strategy-allocation";

describe("simulateStrategyContribution", () => {
  const emptyValues = {
    fixed_income: "0",
    brazilian_equities: "0",
    international_etfs: "0",
    fiis: "0",
  };

  it("distributes cents toward underweight classes and preserves deterministic order", () => {
    const result = simulateStrategyContribution({
      currentValuesCents: {
        fixed_income: "6000",
        brazilian_equities: "4000",
        international_etfs: "0",
        fiis: "0",
      },
      targetPercentages: {
        fixed_income: 50,
        brazilian_equities: 50,
        international_etfs: 0,
        fiis: 0,
      },
      contributionCents: "2000",
    });
    expect(result).toMatchObject({
      totalCents: "10000",
      contributionCents: "2000",
      projectedTotalCents: "12000",
      unallocatedContributionCents: "0",
      allocations: [
        {
          id: "fixed_income",
          currentPercentage: 60,
          projectedValueCents: "6000",
          projectedPercentage: 50,
          contributionValueCents: "0",
        },
        {
          id: "brazilian_equities",
          currentPercentage: 40,
          projectedValueCents: "6000",
          projectedPercentage: 50,
          contributionValueCents: "2000",
        },
        { id: "international_etfs" },
        { id: "fiis" },
      ],
    });
  });

  it("returns zero current weights and leaves a contribution unallocated when rounded target gaps are zero", () => {
    const result = simulateStrategyContribution({
      currentValuesCents: emptyValues,
      targetPercentages: {
        fixed_income: 25,
        brazilian_equities: 25,
        international_etfs: 25,
        fiis: 25,
      },
      contributionCents: "1",
    });
    expect(result.totalCents).toBe("0");
    expect(result.unallocatedContributionCents).toBe("1");
    expect(
      result.allocations.every((item) => item.currentPercentage === 0),
    ).toBe(true);
  });

  it("keeps projected weights at zero when both holdings and contribution are zero", () => {
    const result = simulateStrategyContribution({
      currentValuesCents: emptyValues,
      targetPercentages: {
        fixed_income: 25,
        brazilian_equities: 25,
        international_etfs: 25,
        fiis: 25,
      },
      contributionCents: "0",
    });

    expect(result.projectedTotalCents).toBe("0");
    expect(
      result.allocations.every((item) => item.projectedPercentage === 0),
    ).toBe(true);
  });

  it("allocates equal largest remainders using the fixed class order", () => {
    const result = simulateStrategyContribution({
      currentValuesCents: emptyValues,
      targetPercentages: {
        fixed_income: 50,
        brazilian_equities: 50,
        international_etfs: 0,
        fiis: 0,
      },
      contributionCents: "3",
    });
    expect(
      result.allocations.slice(0, 2).map((item) => item.contributionValueCents),
    ).toEqual(["2", "1"]);
  });
});

describe("strategy asset class metadata", () => {
  it("centralizes official labels, semantic token keys, and stable IDs", () => {
    expect(
      strategyAssetClasses.map(({ id, label, colorToken }) => [
        id,
        label,
        colorToken,
      ]),
    ).toEqual([
      ["fixed_income", "Renda fixa", "--asset-class-fixed-income"],
      [
        "brazilian_equities",
        "Ações e BDRs",
        "--asset-class-brazilian-equities",
      ],
      [
        "international_etfs",
        "ETFs internacionais",
        "--asset-class-international-etfs",
      ],
      ["fiis", "Fundos imobiliários (FIIs)", "--asset-class-fiis"],
    ]);
    expect(strategyAssetClassById.brazilian_equities.label).toBe(
      "Ações e BDRs",
    );
    expect(
      strategyAssetClassById.brazilian_equities.groupingDescription,
    ).toContain("geografia Brasil");
    expect(
      strategyAssetClassById.international_etfs.groupingDescription,
    ).toContain("Exterior ou Global");
  });

  it("resolves colors by stable ID and returns neutral for missing identity", () => {
    expect(getStrategyAssetClassColor("fixed_income")).toBe(
      "var(--asset-class-fixed-income)",
    );
    expect(getStrategyAssetClassColor("brazilian_equities")).toBe(
      "var(--asset-class-brazilian-equities)",
    );
    expect(getStrategyAssetClassColor("international_etfs")).toBe(
      "var(--asset-class-international-etfs)",
    );
    expect(getStrategyAssetClassColor("fiis")).toBe("var(--asset-class-fiis)");
    expect(getStrategyAssetClassColor(null)).toBe(neutralAssetClassColor);
  });
});
