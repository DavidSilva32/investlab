import { describe, expect, it } from "vitest";
import {
  calculateLongTermStrategyWealth,
  getStrategyAssetClassId,
  summarizeStrategyAllocation,
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
  it("keeps the fixed-income class available for an empty portfolio", () => {
    const strategy = calculateLongTermStrategyWealth(
      summarizeStrategyAllocation([]),
      [],
    );

    expect(strategy).toMatchObject({
      complete: true,
      knownValueCents: "0",
      classes: [
        { id: "fixed_income", knownValueCents: "0" },
        { id: "brazilian_equities", knownValueCents: "0" },
        { id: "international_etfs", knownValueCents: "0" },
        { id: "fiis", knownValueCents: "0" },
      ],
    });
  });

  it("subtracts reserve and personal goal balances only from long-term fixed income", () => {
    const portfolio = summarizeStrategyAllocation([
      {
        product: "CDB",
        assetClass: "Renda fixa",
        geography: "Brasil",
        knownValueCents: "10000",
      },
      {
        product: "Ação",
        assetClass: "Renda variável",
        geography: "Brasil",
        knownValueCents: "20000",
      },
      {
        product: "ETF",
        assetClass: "Renda variável",
        geography: "Exterior",
        knownValueCents: "30000",
      },
      {
        product: "FII",
        assetClass: "Fundos",
        geography: "Brasil",
        knownValueCents: "40000",
      },
      {
        product: "Sem classe",
        assetClass: null,
        geography: null,
        knownValueCents: "5000",
      },
    ]);

    const strategy = calculateLongTermStrategyWealth(portfolio, [
      {
        id: "reserve-id",
        kind: "RESERVE",
        purpose: null,
        name: "Reserva",
        balanceTracking: {
          observedAmountCents: "1000",
          observedOn: "2026-11-14",
        },
      },
      {
        id: "travel-id",
        kind: "CUSTOM",
        purpose: "PERSONAL_GOAL",
        name: "Viagem",
        balanceTracking: {
          observedAmountCents: "1500",
          observedOn: "2026-11-16",
        },
      },
      {
        id: "long-term-id",
        kind: "CUSTOM",
        purpose: "LONG_TERM_INVESTMENT",
        name: "Longo prazo",
        balanceTracking: {
          observedAmountCents: "7000",
          observedOn: "2026-11-16",
        },
      },
    ]);

    expect(portfolio.knownValueCents).toBe("105000");
    expect(strategy).toMatchObject({
      complete: true,
      knownValueCents: "102500",
      excludedBalanceCents: "2500",
      excludedObjectives: [
        { name: "Reserva", amountCents: "1000", observedOn: "2026-11-14" },
        { name: "Viagem", amountCents: "1500", observedOn: "2026-11-16" },
      ],
      classes: [
        { id: "fixed_income", knownValueCents: "7500" },
        { id: "brazilian_equities", knownValueCents: "20000" },
        { id: "international_etfs", knownValueCents: "30000" },
        { id: "fiis", knownValueCents: "40000" },
      ],
    });
    expect(
      strategy.classes.map(
        ({ percentageBasisPoints }) => percentageBasisPoints,
      ),
    ).toEqual([732, 1951, 2927, 3902]);
  });

  it("does not assume missing objective balances are zero", () => {
    const portfolio = summarizeStrategyAllocation([
      {
        product: "CDB",
        assetClass: "Renda fixa",
        geography: "Brasil",
        knownValueCents: "10000",
      },
    ]);
    const strategy = calculateLongTermStrategyWealth(portfolio, [
      {
        id: "travel-id",
        kind: "CUSTOM",
        purpose: "PERSONAL_GOAL",
        name: "Viagem",
        balanceTracking: null,
      },
    ]);

    expect(strategy).toMatchObject({
      complete: false,
      limitation: "missing_objective_balance",
      knownValueCents: null,
      missingObjectiveNames: ["Viagem"],
      classes: [],
    });
  });

  it("does not clamp objective balances that exceed known fixed income", () => {
    const portfolio = summarizeStrategyAllocation([
      {
        product: "CDB",
        assetClass: "Renda fixa",
        geography: "Brasil",
        knownValueCents: "10000",
      },
    ]);
    const strategy = calculateLongTermStrategyWealth(portfolio, [
      {
        id: "reserve-id",
        kind: "RESERVE",
        purpose: null,
        name: "Reserva",
        balanceTracking: {
          observedAmountCents: "10001",
          observedOn: "2026-11-14",
        },
      },
    ]);

    expect(strategy).toMatchObject({
      complete: false,
      limitation: "objective_balances_exceed_fixed_income",
      knownValueCents: null,
      excludedBalanceCents: "10001",
      classes: [],
    });
  });

  it("classifies positions using the strategy's shared asset groups", () => {
    expect(
      getStrategyAssetClassId({
        product: "Patria Log - FDO INV IMOB - Responsabilidade Ltda.",
        assetClass: "Renda variavel",
        geography: "Brasil",
      }),
    ).toBe("fiis");
    expect(
      getStrategyAssetClassId({
        product: "Patria Log - FDO INV IMOB - Responsabilidade Ltda.",
        assetClass: null,
        geography: "Brasil",
      }),
    ).toBeNull();
    expect(
      getStrategyAssetClassId({
        product: "CDB",
        assetClass: "Renda fixa",
        geography: "Brasil",
      }),
    ).toBe("fixed_income");
    expect(
      getStrategyAssetClassId({
        product: "Ação ordinária",
        assetClass: "Renda variável",
        geography: "Brasil",
      }),
    ).toBe("brazilian_equities");
    expect(
      getStrategyAssetClassId({
        product: "ETF de índice",
        assetClass: "Renda variável",
        geography: "Exterior",
      }),
    ).toBe("international_etfs");
    expect(
      getStrategyAssetClassId({
        product: "Fundo Imobiliário",
        assetClass: "Fundos",
        geography: "Brasil",
      }),
    ).toBe("fiis");
    expect(
      getStrategyAssetClassId({
        product: "Ação estrangeira",
        assetClass: "Renda variável",
        geography: "Exterior",
      }),
    ).toBeNull();
  });

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
    ).toContain("BDRs identificados");
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

  it("keeps ambiguous Brazilian equities and incomplete ETFs unclassified", () => {
    expect(
      getStrategyAssetClassId({
        product: "Ativo de renda variável",
        assetClass: "Renda variável",
        geography: "Brasil",
      }),
    ).toBeNull();
    expect(
      getStrategyAssetClassId({
        product: "PETR4",
        assetClass: "Renda variável",
        geography: "Brasil",
      }),
    ).toBeNull();
    expect(
      getStrategyAssetClassId({
        product: "ETF de índice",
        assetClass: null,
        geography: "Exterior",
      }),
    ).toBeNull();
  });

  it("requires class evidence to identify equities, BDRs, international ETFs, and FIIs", () => {
    expect(
      getStrategyAssetClassId({
        product: "Ação ordinária",
        assetClass: "Renda variável",
        geography: "Brasil",
      }),
    ).toBe("brazilian_equities");
    expect(
      getStrategyAssetClassId({
        product: "BDR",
        assetClass: "Renda variável",
        geography: null,
      }),
    ).toBe("brazilian_equities");
    expect(
      getStrategyAssetClassId({
        product: "ETF de ações",
        assetClass: "Renda variável",
        geography: "Global",
      }),
    ).toBe("international_etfs");
    expect(
      getStrategyAssetClassId({
        product: "Fundo Imobiliário",
        assetClass: "Fundos",
        geography: "Brasil",
      }),
    ).toBe("fiis");
    expect(
      getStrategyAssetClassId({
        product: "CDB",
        assetClass: "Renda fixa",
        geography: "Brasil",
      }),
    ).toBe("fixed_income");
    expect(
      getStrategyAssetClassId({
        product: "ETF renda fixa",
        assetClass: "Renda fixa",
        geography: "Exterior",
      }),
    ).toBe("fixed_income");
    expect(
      getStrategyAssetClassId({
        product: "Fundo",
        subClass: "FII",
        assetClass: "Fundos",
        geography: "Brasil",
      }),
    ).toBe("fiis");
    expect(
      getStrategyAssetClassId({
        product: "Fundo de investimento",
        assetClass: "Fundos",
        geography: "Brasil",
      }),
    ).toBeNull();
    expect(
      getStrategyAssetClassId({
        product: "Ativo",
        subClass: "Ação ordinária",
        assetClass: "Renda variável",
        geography: "Brasil",
      }),
    ).toBe("brazilian_equities");
  });

  it("calculates shares in integer basis points from known cents only", () => {
    const summary = summarizeStrategyAllocation([
      {
        product: "CDB",
        assetClass: "Renda fixa",
        geography: "Brasil",
        knownValueCents: "10000",
      },
      {
        product: "Ação ordinária",
        assetClass: "Renda variável",
        geography: "Brasil",
        knownValueCents: "30000",
      },
      {
        product: "Produto não identificado",
        assetClass: null,
        geography: null,
        knownValueCents: "10000",
      },
      {
        product: "Sem avaliação",
        assetClass: "Renda fixa",
        geography: "Brasil",
        knownValueCents: "0",
        valueCents: null,
      },
    ]);

    expect(summary.knownValueCents).toBe("50000");
    expect(summary.unclassifiedKnownValueCents).toBe("10000");
    expect(
      summary.classes.map(({ percentageBasisPoints }) => percentageBasisPoints),
    ).toEqual([2000, 6000, 0, 0]);
    expect(summary.unclassifiedPercentageBasisPoints).toBe(2000);
  });

  it("defaults missing money fields to zero while preserving a supplied value", () => {
    const summary = summarizeStrategyAllocation([
      {
        product: "CDB",
        assetClass: "Renda fixa",
        geography: "Brasil",
        valueCents: "875",
      },
      {
        product: "Produto sem identificação",
        assetClass: null,
      },
    ]);

    expect(summary.knownValueCents).toBe("875");
    expect(summary.classes[0]?.knownValueCents).toBe("875");
    expect(summary.unclassifiedKnownValueCents).toBe("0");
    expect(summary.unclassifiedPositionCount).toBe(1);
  });
});
