import { describe, expect, it, vi } from "vitest";
import {
  calculateAnalysisIndicators,
  StockAnalysisService,
} from "@/backend/services/stock-analysis.service";

describe("StockAnalysisService ticker search", () => {
  it("trims a valid search query and returns provider matches", async () => {
    const marketProvider = {
      getByTicker: vi.fn(),
      getQuoteByTicker: vi.fn(),
      searchTickers: vi
        .fn()
        .mockResolvedValue([{ ticker: "VALE3", name: "Vale" }]),
    };
    const service = new StockAnalysisService(
      marketProvider,
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn(), save: vi.fn() },
    );
    await expect(
      service.searchTickers("  Vale  ", "request-search"),
    ).resolves.toEqual([{ ticker: "VALE3", name: "Vale" }]);
    expect(marketProvider.searchTickers).toHaveBeenCalledWith("Vale");
  });

  it("skips provider calls for queries shorter than the minimum", async () => {
    const marketProvider = {
      getByTicker: vi.fn(),
      getQuoteByTicker: vi.fn(),
      searchTickers: vi.fn(),
    };
    const service = new StockAnalysisService(
      marketProvider,
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn(), save: vi.fn() },
    );
    await expect(service.searchTickers("A")).resolves.toEqual([]);
    expect(marketProvider.searchTickers).not.toHaveBeenCalled();
  });
});

describe("StockAnalysisService", () => {
  it("returns market data when fundamentals are absent from the cache", async () => {
    const marketProvider = {
      searchTickers: vi.fn().mockResolvedValue([]),
      getQuoteByTicker: vi.fn(),
      getByTicker: vi.fn().mockResolvedValue({
        ticker: "PETR4",
        companyName: "Petrobras",
        cnpj: "33000167000101",
        price: 30,
        marketCap: 300,
        changePercent: 1.2,
        priceUpdatedAt: "2026-09-19T00:00:00.000Z",
        history: [],
      }),
    };
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([]),
      save: vi.fn(),
    };
    const fundamentalsProvider = {
      getByTicker: vi.fn().mockResolvedValue([]),
    };
    const service = new StockAnalysisService(
      marketProvider,
      fundamentalsProvider,
      repository,
    );

    await expect(service.getByTicker("PETR4")).resolves.toMatchObject({
      ticker: "PETR4",
      fundamentals: [],
    });
    expect(repository.listByTicker).toHaveBeenCalledWith("PETR4");
  });

  it("preserves reported annual and interim periods while appending a derived LTM", async () => {
    const marketProvider = {
      searchTickers: vi.fn().mockResolvedValue([]),
      getQuoteByTicker: vi.fn(),
      getByTicker: vi.fn().mockResolvedValue({
        ticker: "PETR4",
        companyName: "Petrobras",
        cnpj: "33000167000101",
        price: 30,
        marketCap: 240,
        changePercent: 1.2,
        priceUpdatedAt: "2026-09-19T15:30:00-03:00",
        history: [],
      }),
    };
    const annual = {
      referenceDate: "2025-12-31",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      filingReferenceDate: "2026-03-20",
      exerciseOrder: "last" as const,
      periodBasis: "annual" as const,
      periodType: "annual" as const,
      sourceDocument: "DFP" as const,
      netIncomeAccount: "3.11",
      netIncomeConcept: "consolidated_net_income",
      equityAccount: "2.07",
      equityConcept: "consolidated_equity",
      revenueAccountLabel: "Receita operacional consolidada",
      revenue: "200",
      netIncome: "40",
      equity: "80",
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
    };
    const currentYtd = {
      referenceDate: "2026-06-30",
      periodStart: "2026-01-01",
      periodEnd: "2026-06-30",
      filingReferenceDate: "2026-08-10",
      exerciseOrder: "last" as const,
      periodBasis: "year_to_date" as const,
      periodType: "interim" as const,
      sourceDocument: "ITR" as const,
      netIncomeAccount: "3.09",
      netIncomeConcept: "consolidated_net_income",
      equityAccount: "2.07",
      equityConcept: "consolidated_equity",
      revenueAccountLabel: "Receita operacional consolidada",
      revenue: "120",
      netIncome: "24",
      equity: "90",
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
      revenueVersion: "1",
      netIncomeVersion: "1",
      equityVersion: "1",
    };
    const comparativeYtd = {
      ...currentYtd,
      referenceDate: "2025-06-30",
      periodStart: "2025-01-01",
      periodEnd: "2025-06-30",
      exerciseOrder: "previous" as const,
      revenue: "80",
      netIncome: "16",
      equity: "70",
      netIncomeAccount: "3.09",
      netIncomeConcept: "consolidated_net_income",
      equityAccount: "2.07",
      equityConcept: "consolidated_equity",
      revenueAccountLabel: "Receita operacional consolidada",
    };
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([]),
      save: vi.fn(),
    };
    const fundamentalsProvider = {
      getByTicker: vi
        .fn()
        .mockResolvedValue([annual, currentYtd, comparativeYtd]),
    };
    const service = new StockAnalysisService(
      marketProvider,
      fundamentalsProvider,
      repository,
    );

    const result = await service.getByTicker("PETR4");
    const derivedLtm = result.fundamentals[3];

    expect(result.fundamentals).toHaveLength(4);
    expect(result.fundamentals.slice(0, 3)).toEqual([
      expect.objectContaining({
        referenceDate: annual.referenceDate,
        periodBasis: "annual",
        revenue: "200",
        netIncome: "40",
      }),
      expect.objectContaining({
        referenceDate: currentYtd.referenceDate,
        periodBasis: "year_to_date",
        revenue: "120",
        netIncome: "24",
        equity: "90",
      }),
      expect.objectContaining({
        referenceDate: comparativeYtd.referenceDate,
        exerciseOrder: "previous",
        periodBasis: "year_to_date",
        revenue: "80",
        netIncome: "16",
      }),
    ]);
    expect(derivedLtm).toMatchObject({
      referenceDate: "2026-06-30",
      periodStart: "2025-07-01",
      periodEnd: "2026-06-30",
      filingReferenceDate: "2026-08-10",
      periodBasis: "trailing_twelve_months",
      isDerived: true,
      revenue: "240.00",
      netIncome: "48.00",
      equity: null,
    });
    expect(result.indicators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "pe",
          value: 5,
          referenceDate: "2026-06-30",
          periodBasis: "trailing_twelve_months",
          marketDataDate: "2026-09-19T15:30:00-03:00",
        }),
        expect.objectContaining({
          key: "pb",
          value: 240 / 90,
          referenceDate: "2026-06-30",
          periodBasis: "point_in_time",
        }),
      ]),
    );
  });
});

it("calculates only ratios supported by compatible statement periods", () => {
  const indicators = calculateAnalysisIndicators([
    {
      referenceDate: "2025-12-31",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      filingReferenceDate: "2026-03-20",
      exerciseOrder: "last",
      periodBasis: "annual",
      periodType: "annual",
      sourceDocument: "DFP",
      netIncomeAccount: "3.11",
      netIncomeConcept: "consolidated_net_income",
      equityAccount: "2.07",
      equityConcept: "consolidated_equity",
      revenue: "100",
      netIncome: "20",
      equity: "80",
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
    },
    {
      referenceDate: "2024-12-31",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
      filingReferenceDate: "2025-03-20",
      exerciseOrder: "last",
      periodBasis: "annual",
      periodType: "annual",
      sourceDocument: "DFP",
      netIncomeAccount: "3.11",
      netIncomeConcept: "consolidated_net_income",
      equityAccount: "2.07",
      equityConcept: "consolidated_equity",
      revenue: "90",
      netIncome: "10",
      equity: "60",
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
    },
    {
      referenceDate: "2026-06-30",
      periodStart: "2026-01-01",
      periodEnd: "2026-06-30",
      filingReferenceDate: "2026-08-10",
      exerciseOrder: "last",
      periodBasis: "year_to_date",
      periodType: "interim",
      sourceDocument: "ITR",
      revenue: "50",
      netIncome: "5",
      equity: "85",
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
    },
  ]);

  expect(indicators).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        key: "roe",
        value: 28.57142857142857,
        sourceDocument: "DFP",
      }),
      expect.objectContaining({
        key: "netMargin",
        value: 10,
        sourceDocument: "ITR",
      }),
      expect.objectContaining({ key: "pe", value: null }),
      expect.objectContaining({ key: "pb", value: null }),
    ]),
  );
});

it("keeps annual ROE unavailable when either year lacks matching concepts", () => {
  const periods = [
    {
      referenceDate: "2025-12-31",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      exerciseOrder: "last" as const,
      sourceDocument: "DFP" as const,
      periodBasis: "annual" as const,
      periodType: "annual" as const,
      netIncome: "20",
      netIncomeAccount: "3.11",
      netIncomeConcept: "consolidated_net_income",
      equity: "80",
      equityAccount: "2.07",
      equityConcept: "consolidated_equity",
      revenue: null,
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
    },
    {
      referenceDate: "2024-12-31",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
      exerciseOrder: "last" as const,
      sourceDocument: "DFP" as const,
      periodBasis: "annual" as const,
      periodType: "annual" as const,
      netIncome: "10",
      netIncomeAccount: "3.11",
      netIncomeConcept: "consolidated_net_income",
      equity: "60",
      equityAccount: "2.07",
      equityConcept: "consolidated_equity",
      revenue: null,
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
    },
  ];

  for (const incompatible of [
    periods.map((period, index) =>
      index === 1 ? { ...period, netIncomeConcept: "other_income" } : period,
    ),
    periods.map((period, index) =>
      index === 1 ? { ...period, equityConcept: "other_equity" } : period,
    ),
  ]) {
    expect(
      calculateAnalysisIndicators(incompatible).find(
        ({ key }) => key === "roe",
      ),
    ).toMatchObject({
      value: null,
      unavailableReason: expect.stringContaining(
        "demonstrações financeiras anuais",
      ),
    });
  }
});

it("calculates LTM flows from annual and aligned current-filing YTD periods", () => {
  const common = {
    revenue: null,
    netIncome: null,
    equity: null,
    revenueAccountLabel: "Receita operacional consolidada",
    netIncomeConcept: "consolidated_net_income",
    equityAccount: "2.07",
    equityConcept: "consolidated_equity",
    assets: null,
    liabilities: null,
    cash: null,
    debt: null,
  };
  const periods = [
    {
      ...common,
      referenceDate: "2025-12-31",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      filingReferenceDate: "2026-03-20",
      exerciseOrder: "last" as const,
      periodBasis: "annual" as const,
      periodType: "annual" as const,
      sourceDocument: "DFP" as const,
      revenue: "100",
      netIncome: "20",
      equity: "80",
      netIncomeAccount: "3.11",
    },
    {
      ...common,
      referenceDate: "2026-06-30",
      periodStart: "2026-01-01",
      periodEnd: "2026-06-30",
      filingReferenceDate: "2026-08-10",
      exerciseOrder: "last" as const,
      periodBasis: "year_to_date" as const,
      periodType: "interim" as const,
      sourceDocument: "ITR" as const,
      revenue: "60",
      netIncome: "12",
      equity: "90",
      revenueVersion: "1",
      netIncomeVersion: "1",
      equityVersion: "1",
      revenueAccountLabel: "Receita operacional consolidada",
      netIncomeAccount: "3.09",
      netIncomeConcept: "consolidated_net_income",
      equityAccount: "2.07",
      equityConcept: "consolidated_equity",
    },
    {
      ...common,
      referenceDate: "2025-06-30",
      periodStart: "2025-01-01",
      periodEnd: "2025-06-30",
      filingReferenceDate: "2026-08-10",
      exerciseOrder: "previous" as const,
      periodBasis: "year_to_date" as const,
      periodType: "interim" as const,
      sourceDocument: "ITR" as const,
      revenue: "40",
      netIncome: "8",
      equity: "70",
      revenueVersion: "1",
      netIncomeVersion: "1",
      equityVersion: "1",
      revenueAccountLabel: "Receita operacional consolidada",
      netIncomeAccount: "3.09",
      netIncomeConcept: "consolidated_net_income",
      equityAccount: "2.07",
      equityConcept: "consolidated_equity",
    },
  ];
  periods.push(
    {
      ...periods[1]!,
      referenceDate: "2026-03-31",
      periodEnd: "2026-03-31",
      revenue: "30",
      netIncome: "6",
      equity: "85",
    },
    {
      ...periods[2]!,
      referenceDate: "2025-03-31",
      periodEnd: "2025-03-31",
      revenue: "20",
      netIncome: "3",
      equity: "75",
    },
  );

  const indicators = calculateAnalysisIndicators(periods, 240);
  expect(indicators).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        key: "pe",
        value: 10,
        referenceDate: "2026-06-30",
        periodBasis: "trailing_twelve_months",
      }),
      expect.objectContaining({
        key: "pb",
        value: 240 / 90,
        referenceDate: "2026-06-30",
        periodBasis: "point_in_time",
      }),
      expect.objectContaining({
        key: "roe",
        value: 30,
        referenceDate: "2026-06-30",
        periodBasis: "trailing_twelve_months",
      }),
      expect.objectContaining({
        key: "netMargin",
        value: 20,
        referenceDate: "2026-06-30",
        periodBasis: "trailing_twelve_months",
      }),
    ]),
  );

  const mismatchedOpeningAccount = periods.map((period) =>
    period.exerciseOrder === "previous"
      ? { ...period, equityAccount: "2.08" }
      : period,
  );
  expect(
    calculateAnalysisIndicators(mismatchedOpeningAccount, 240).find(
      ({ key }) => key === "roe",
    ),
  ).toMatchObject({
    value: null,
    unavailableReason: expect.stringContaining("lucro LTM encerrado em"),
  });

  const legacyDuplicateOpening = {
    ...periods[2]!,
    periodEnd: undefined,
    referenceDate: "2025-06-30",
    equity: "71",
  };
  expect(
    calculateAnalysisIndicators([...periods, legacyDuplicateOpening], 240).find(
      ({ key }) => key === "roe",
    ),
  ).toMatchObject({
    value: null,
    unavailableReason: expect.stringContaining("lucro LTM encerrado em"),
  });

  const duplicateEndingBalance = {
    ...periods[1]!,
    periodEnd: undefined,
    exerciseOrder: undefined,
    equity: "91",
  };
  expect(
    calculateAnalysisIndicators([...periods, duplicateEndingBalance], 240).find(
      ({ key }) => key === "roe",
    ),
  ).toMatchObject({
    value: null,
    unavailableReason: expect.stringContaining("lucro LTM encerrado em"),
  });

  const mismatchedIncomeConcept = periods.map((period) =>
    period.sourceDocument === "DFP"
      ? { ...period, netIncomeConcept: "other_income_concept" }
      : period,
  );
  expect(
    calculateAnalysisIndicators(mismatchedIncomeConcept, 240).find(
      ({ key }) => key === "pe",
    ),
  ).toMatchObject({
    value: null,
    referenceDate: null,
    periodBasis: null,
  });

  const mismatchedInterimAccount = periods.map((period) =>
    period.exerciseOrder === "previous"
      ? { ...period, netIncomeAccount: "3.11" }
      : period,
  );
  expect(
    calculateAnalysisIndicators(mismatchedInterimAccount, 240).find(
      ({ key }) => key === "pe",
    ),
  ).toMatchObject({
    value: 12,
    referenceDate: "2025-12-31",
    periodBasis: "annual",
  });

  const missingIncomeConcept = periods.map((period) =>
    period.exerciseOrder === "last" && period.sourceDocument === "ITR"
      ? { ...period, netIncomeConcept: null }
      : period,
  );
  expect(
    calculateAnalysisIndicators(missingIncomeConcept, 240).find(
      ({ key }) => key === "pe",
    ),
  ).toMatchObject({
    value: 12,
    referenceDate: "2025-12-31",
    periodBasis: "annual",
  });

  const missingAnnualIncomeAccount = periods.map((period) =>
    period.sourceDocument === "DFP"
      ? { ...period, netIncomeAccount: null }
      : period,
  );
  expect(
    calculateAnalysisIndicators(missingAnnualIncomeAccount, 240).find(
      ({ key }) => key === "pe",
    ),
  ).toMatchObject({
    value: null,
    unavailableReason: expect.stringContaining(
      "demonstrações financeiras anuais",
    ),
  });

  expect(
    calculateAnalysisIndicators(
      periods.map((period) => ({
        ...period,
        revenue: "invalid amount",
        netIncome: "invalid amount",
      })),
      240,
    ).find(({ key }) => key === "pe"),
  ).toMatchObject({
    value: null,
    referenceDate: null,
    periodBasis: null,
    unavailableReason: expect.stringContaining(
      "demonstrações financeiras anuais",
    ),
  });
});

it("keeps valid LTM income and ROE when revenue is unavailable", () => {
  const periods = [
    {
      referenceDate: "2025-12-31",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      filingReferenceDate: "2026-03-20",
      exerciseOrder: "last" as const,
      periodBasis: "annual" as const,
      periodType: "annual" as const,
      sourceDocument: "DFP" as const,
      revenue: null,
      netIncome: "20",
      equity: "80",
      netIncomeAccount: "3.11",
      netIncomeConcept: "consolidated_net_income",
      equityAccount: "2.07",
      equityConcept: "consolidated_equity",
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
    },
    {
      referenceDate: "2026-06-30",
      periodStart: "2026-01-01",
      periodEnd: "2026-06-30",
      filingReferenceDate: "2026-08-10",
      exerciseOrder: "last" as const,
      periodBasis: "year_to_date" as const,
      periodType: "interim" as const,
      sourceDocument: "ITR" as const,
      revenue: null,
      netIncome: "12",
      equity: "90",
      netIncomeVersion: "1",
      netIncomeAccount: "3.09",
      netIncomeConcept: "consolidated_net_income",
      equityVersion: "1",
      equityAccount: "2.07",
      equityConcept: "consolidated_equity",
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
    },
    {
      referenceDate: "2025-06-30",
      periodStart: "2025-01-01",
      periodEnd: "2025-06-30",
      filingReferenceDate: "2026-08-10",
      exerciseOrder: "previous" as const,
      periodBasis: "year_to_date" as const,
      periodType: "interim" as const,
      sourceDocument: "ITR" as const,
      revenue: null,
      netIncome: "8",
      equity: "70",
      netIncomeVersion: "1",
      netIncomeAccount: "3.09",
      netIncomeConcept: "consolidated_net_income",
      equityVersion: "1",
      equityAccount: "2.07",
      equityConcept: "consolidated_equity",
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
    },
  ];

  const indicators = calculateAnalysisIndicators(periods, 240);
  expect(indicators).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        key: "pe",
        value: 10,
        periodBasis: "trailing_twelve_months",
      }),
      expect.objectContaining({
        key: "roe",
        value: 30,
        periodBasis: "trailing_twelve_months",
      }),
      expect.objectContaining({ key: "netMargin", value: null }),
    ]),
  );
});

it("does not expose bank intermediation income as a comparable net margin", () => {
  const common = {
    revenueAccountLabel: "Receitas da Intermediação Financeira",
    equity: "80",
    equityVersion: "1",
    equityAccount: "2.07",
    equityConcept: "consolidated_equity",
    assets: null,
    liabilities: null,
    cash: null,
    debt: null,
  };
  const periods = [
    {
      ...common,
      referenceDate: "2025-12-31",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      filingReferenceDate: "2026-03-20",
      exerciseOrder: "last" as const,
      periodBasis: "annual" as const,
      periodType: "annual" as const,
      sourceDocument: "DFP" as const,
      revenue: "100",
      netIncome: "20",
      netIncomeAccount: "3.11",
      netIncomeConcept: "consolidated_net_income",
    },
    {
      ...common,
      referenceDate: "2026-06-30",
      periodStart: "2026-01-01",
      periodEnd: "2026-06-30",
      filingReferenceDate: "2026-08-10",
      exerciseOrder: "last" as const,
      periodBasis: "year_to_date" as const,
      periodType: "interim" as const,
      sourceDocument: "ITR" as const,
      revenue: "60",
      netIncome: "12",
      revenueVersion: "1",
      netIncomeVersion: "1",
      netIncomeAccount: "3.09",
      netIncomeConcept: "consolidated_net_income",
    },
    {
      ...common,
      referenceDate: "2025-06-30",
      periodStart: "2025-01-01",
      periodEnd: "2025-06-30",
      filingReferenceDate: "2026-08-10",
      exerciseOrder: "previous" as const,
      periodBasis: "year_to_date" as const,
      periodType: "interim" as const,
      sourceDocument: "ITR" as const,
      revenue: "40",
      netIncome: "8",
      revenueVersion: "1",
      netIncomeVersion: "1",
      netIncomeAccount: "3.09",
      netIncomeConcept: "consolidated_net_income",
    },
  ];

  const indicators = calculateAnalysisIndicators(periods, 240);
  expect(indicators.find(({ key }) => key === "pe")).toMatchObject({
    value: 10,
    periodBasis: "trailing_twelve_months",
  });
  expect(indicators.find(({ key }) => key === "roe")).toMatchObject({
    value: 30,
    periodBasis: "trailing_twelve_months",
  });
  expect(indicators.find(({ key }) => key === "netMargin")).toMatchObject({
    value: null,
    unavailableReason:
      "Indisponível: a receita de intermediação financeira não foi aprovada como denominador comparável para margem bancária.",
  });
});

it("does not derive LTM when the comparative YTD came from another filing", () => {
  const base = {
    periodType: "interim" as const,
    sourceDocument: "ITR" as const,
    periodBasis: "year_to_date" as const,
    periodStart: "2025-01-01",
    revenue: "50",
    netIncome: "10",
    equity: "70",
    assets: null,
    liabilities: null,
    cash: null,
    debt: null,
  };
  const indicators = calculateAnalysisIndicators(
    [
      {
        ...base,
        referenceDate: "2026-06-30",
        periodEnd: "2026-06-30",
        filingReferenceDate: "2026-08-10",
        exerciseOrder: "last",
      },
      {
        ...base,
        referenceDate: "2025-06-30",
        periodEnd: "2025-06-30",
        filingReferenceDate: "2025-08-10",
        exerciseOrder: "previous",
      },
    ],
    200,
  );
  expect(indicators.find(({ key }) => key === "pe")).toMatchObject({
    value: null,
    referenceDate: null,
    periodBasis: null,
  });
});

it("uses the annual fallback when flow versions do not align", () => {
  const common = {
    equity: "70",
    assets: null,
    liabilities: null,
    cash: null,
    debt: null,
  };
  const indicators = calculateAnalysisIndicators(
    [
      {
        ...common,
        referenceDate: "2025-12-31",
        periodStart: "2025-01-01",
        periodEnd: "2025-12-31",
        filingReferenceDate: "2026-03-20",
        exerciseOrder: "last",
        periodBasis: "annual",
        periodType: "annual",
        sourceDocument: "DFP",
        netIncomeAccount: "3.11",
        netIncomeConcept: "consolidated_net_income",
        revenue: "100",
        netIncome: "20",
      },
      {
        ...common,
        referenceDate: "2026-06-30",
        periodStart: "2026-01-01",
        periodEnd: "2026-06-30",
        filingReferenceDate: "2026-08-10",
        exerciseOrder: "last",
        periodBasis: "year_to_date",
        periodType: "interim",
        sourceDocument: "ITR",
        revenue: "60",
        netIncome: "12",
        revenueVersion: "2",
        netIncomeVersion: "2",
      },
      {
        ...common,
        referenceDate: "2025-06-30",
        periodStart: "2025-01-01",
        periodEnd: "2025-06-30",
        filingReferenceDate: "2026-08-10",
        exerciseOrder: "previous",
        periodBasis: "year_to_date",
        periodType: "interim",
        sourceDocument: "ITR",
        revenue: "40",
        netIncome: "8",
        revenueVersion: "1",
        netIncomeVersion: "1",
      },
    ],
    240,
  );

  expect(indicators.find(({ key }) => key === "pe")).toMatchObject({
    value: 12,
    referenceDate: "2025-12-31",
    periodBasis: "annual",
  });
});

it("explains unavailable ratios using their active LTM basis", () => {
  const periods = [
    {
      referenceDate: "2025-12-31",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      filingReferenceDate: "2026-03-20",
      exerciseOrder: "last" as const,
      periodBasis: "annual" as const,
      periodType: "annual" as const,
      sourceDocument: "DFP" as const,
      revenue: "100",
      netIncome: "0",
      equity: "70",
      netIncomeAccount: "3.11",
      netIncomeConcept: "consolidated_net_income",
      equityAccount: "2.07",
      equityConcept: "consolidated_equity",
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
    },
    {
      referenceDate: "2026-06-30",
      periodStart: "2026-01-01",
      periodEnd: "2026-06-30",
      filingReferenceDate: "2026-08-10",
      exerciseOrder: "last" as const,
      periodBasis: "year_to_date" as const,
      periodType: "interim" as const,
      sourceDocument: "ITR" as const,
      revenue: "60",
      netIncome: "-5",
      equity: "90",
      revenueVersion: "1",
      netIncomeVersion: "1",
      equityVersion: "2",
      netIncomeAccount: "3.09",
      netIncomeConcept: "consolidated_net_income",
      equityAccount: "2.07",
      equityConcept: "consolidated_equity",
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
    },
    {
      referenceDate: "2025-06-30",
      periodStart: "2025-01-01",
      periodEnd: "2025-06-30",
      filingReferenceDate: "2026-08-10",
      exerciseOrder: "previous" as const,
      periodBasis: "year_to_date" as const,
      periodType: "interim" as const,
      sourceDocument: "ITR" as const,
      revenue: "40",
      netIncome: "-3",
      equity: "80",
      revenueVersion: "1",
      netIncomeVersion: "1",
      equityVersion: "1",
      netIncomeAccount: "3.09",
      netIncomeConcept: "consolidated_net_income",
      equityAccount: "2.07",
      equityConcept: "consolidated_equity",
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
    },
  ];

  const indicators = calculateAnalysisIndicators(periods, 240);
  expect(indicators.find(({ key }) => key === "pe")?.unavailableReason).toBe(
    "Indisponível: o lucro líquido positivo não está disponível no LTM encerrado em 2026-06-30.",
  );
  expect(indicators.find(({ key }) => key === "roe")?.unavailableReason).toBe(
    "Indisponível: não foi possível reconciliar o lucro LTM encerrado em 2026-06-30 com patrimônio líquido médio compatível nas datas-base e versões disponíveis.",
  );
});

it("calculates P/L and P/VP only from market cap and the latest annual DFP", () => {
  const indicators = calculateAnalysisIndicators(
    [
      {
        referenceDate: "2025-12-31",
        periodStart: "2025-01-01",
        periodEnd: "2025-12-31",
        periodType: "annual",
        sourceDocument: "DFP",
        exerciseOrder: "last",
        periodBasis: "annual",
        filingReferenceDate: null,
        isDerived: false,
        netIncomeAccount: "3.11",
        netIncomeConcept: "consolidated_net_income",
        equityAccount: "2.07",
        equityConcept: "consolidated_equity",
        revenue: "100",
        netIncome: "20",
        equity: "80",
        assets: null,
        liabilities: null,
        cash: null,
        debt: null,
      },
    ],
    400,
  );

  expect(indicators).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ key: "pe", value: 20, sourceDocument: "DFP" }),
      expect.objectContaining({ key: "pb", value: 5, sourceDocument: "DFP" }),
      expect.objectContaining({
        key: "roe",
        value: null,
        unavailableReason:
          "Indisponível: são necessárias demonstrações financeiras anuais de dois anos consecutivos, com lucro líquido e patrimônio líquido informados.",
      }),
    ]),
  );
});

it("uses the reported reference date when a legacy balance lacks period metadata", () => {
  const indicators = calculateAnalysisIndicators(
    [
      {
        referenceDate: "2024-06-30",
        sourceDocument: "ITR",
        periodType: "interim",
        periodBasis: "year_to_date",
        exerciseOrder: "last",
        revenue: null,
        netIncome: null,
        equity: "80",
        assets: null,
        liabilities: null,
        cash: null,
        debt: null,
      },
      {
        referenceDate: "2025-06-30",
        sourceDocument: "ITR",
        periodType: "interim",
        periodBasis: "year_to_date",
        exerciseOrder: "last",
        revenue: null,
        netIncome: null,
        equity: "100",
        assets: null,
        liabilities: null,
        cash: null,
        debt: null,
      },
    ],
    200,
  );

  expect(indicators.find(({ key }) => key === "pb")).toMatchObject({
    value: 2,
    referenceDate: "2025-06-30",
    periodBasis: "point_in_time",
    sourceDocument: "ITR",
  });
});

describe("StockAnalysisService cache and failures", () => {
  const market = {
    ticker: "PETR4",
    companyName: "Petrobras",
    cnpj: "33000167000101",
    price: 30,
    marketCap: 300,
    changePercent: 1.2,
    priceUpdatedAt: "2026-09-19T00:00:00.000Z",
    history: [],
  };

  it("rejects invalid tickers before calling providers", async () => {
    const marketProvider = {
      getByTicker: vi.fn(),
      getQuoteByTicker: vi.fn(),
      searchTickers: vi.fn(),
    };
    const service = new StockAnalysisService(
      marketProvider,
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn(), save: vi.fn() },
    );

    await expect(service.getByTicker("invalid")).rejects.toMatchObject({
      statusCode: 400,
      message: "Informe um ticker B3 válido.",
    });
    expect(marketProvider.getByTicker).not.toHaveBeenCalled();
  });

  it("uses a recent fundamentals cache", async () => {
    const marketProvider = {
      getByTicker: vi.fn().mockResolvedValue(market),
      getQuoteByTicker: vi.fn(),
      searchTickers: vi.fn(),
    };
    const fundamentalsProvider = { getByTicker: vi.fn() };
    const cachedPeriod = {
      referenceDate: "2025-12-31",
      periodStart: null,
      periodEnd: "2025-12-31",
      filingReferenceDate: null,
      exerciseOrder: "last",
      periodBasis: "annual",
      periodType: "annual",
      sourceDocument: "DFP",
      revenue: "100",
      netIncome: "10",
      equity: "50",
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
      fetchedAt: new Date(),
    };
    const legacyInterimPeriod = {
      ...cachedPeriod,
      referenceDate: "2025-06-30",
      periodEnd: null,
      exerciseOrder: null,
      periodBasis: "legacy",
      periodType: "interim",
      sourceDocument: "ITR",
    };
    const comparativeInterimPeriod = {
      ...cachedPeriod,
      referenceDate: "2024-06-30",
      periodEnd: "2024-06-30",
      exerciseOrder: "previous",
      periodBasis: "year_to_date",
      periodType: "interim",
      sourceDocument: "ITR",
    };
    const repository = {
      listByTicker: vi
        .fn()
        .mockResolvedValue([
          cachedPeriod,
          legacyInterimPeriod,
          comparativeInterimPeriod,
        ]),
      save: vi.fn(),
    };
    const service = new StockAnalysisService(
      marketProvider,
      fundamentalsProvider,
      repository,
    );

    const result = await service.getByTicker(" petr4 ");

    expect(result.fundamentals).toEqual([
      {
        referenceDate: "2025-12-31",
        periodStart: null,
        periodEnd: "2025-12-31",
        filingReferenceDate: null,
        exerciseOrder: "last",
        periodBasis: "annual",
        isDerived: false,
        periodType: "annual",
        sourceDocument: "DFP",
        revenue: "100",
        netIncome: "10",
        equity: "50",
        assets: null,
        liabilities: null,
        cash: null,
        debt: null,
      },
      expect.objectContaining({
        referenceDate: "2025-06-30",
        periodStart: null,
        periodEnd: "2025-06-30",
        filingReferenceDate: null,
        exerciseOrder: "last",
        periodBasis: "unknown",
        isDerived: false,
        periodType: "interim",
        sourceDocument: "ITR",
        revenue: "100",
        netIncome: "10",
        equity: "50",
      }),
      expect.objectContaining({
        referenceDate: "2024-06-30",
        periodEnd: "2024-06-30",
        exerciseOrder: "previous",
        periodBasis: "year_to_date",
        isDerived: false,
      }),
    ]);
    expect(fundamentalsProvider.getByTicker).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("surfaces the missing-CNPJ application error", async () => {
    const marketProvider = {
      getByTicker: vi.fn().mockResolvedValue({ ...market, cnpj: null }),
      getQuoteByTicker: vi.fn(),
      searchTickers: vi.fn(),
    };
    const fundamentalsProvider = { getByTicker: vi.fn().mockResolvedValue([]) };
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([]),
      save: vi.fn(),
    };
    const service = new StockAnalysisService(
      marketProvider,
      fundamentalsProvider,
      repository,
    );

    await expect(service.getByTicker("PETR4")).rejects.toMatchObject({
      statusCode: 422,
      message: "Não foi possível associar o ativo à CVM.",
    });
    expect(fundamentalsProvider.getByTicker).toHaveBeenCalledWith({
      ticker: "PETR4",
      cnpj: null,
    });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("wraps unexpected fundamentals refresh errors for the route boundary", async () => {
    const marketProvider = {
      getByTicker: vi.fn().mockResolvedValue(market),
      getQuoteByTicker: vi.fn(),
      searchTickers: vi.fn(),
    };
    const fundamentalsProvider = {
      getByTicker: vi.fn().mockRejectedValue(new Error("provider details")),
    };
    const service = new StockAnalysisService(
      marketProvider,
      fundamentalsProvider,
      { listByTicker: vi.fn().mockResolvedValue([]), save: vi.fn() },
    );

    await expect(service.getByTicker("PETR4")).rejects.toMatchObject({
      statusCode: 502,
      message:
        "Não foi possível consultar os demonstrativos oficiais da CVM agora.",
    });
  });
});

it("returns unavailable ratios when statement values are missing or invalid", () => {
  const indicators = calculateAnalysisIndicators([
    {
      referenceDate: "2025-12-31",
      periodType: "annual",
      sourceDocument: "DFP",
      revenue: null,
      netIncome: "not-a-number",
      equity: null,
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
    },
  ]);

  expect(indicators).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ key: "netMargin", value: null }),
      expect.objectContaining({ key: "pe", value: null }),
      expect.objectContaining({ key: "pb", value: null }),
      expect.objectContaining({ key: "roe", value: null }),
    ]),
  );
});
