import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

vi.mock("@/backend/repositories/screener.repository", () => ({
  screenerRepository: {
    getComparisonMetadata: vi.fn().mockResolvedValue([]),
    getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  calculateAnalysisIndicators,
  StockAnalysisService,
} from "@/backend/services/stock-analysis.service";

function rejectedScreenerLookups() {
  return {
    getComparisonMetadata: vi.fn().mockRejectedValue(new Error("offline")),
    getValidatedAnalysisQuote: vi.fn().mockRejectedValue(new Error("offline")),
  };
}

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
      rejectedScreenerLookups(),
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
      rejectedScreenerLookups(),
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

describe("StockAnalysisService optional Screener lookups", () => {
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

  it("continues analysis when issuer metadata lookup fails", async () => {
    const logger = await import("@/infrastructure/logging/logger");
    const warn = vi.spyOn(logger.logger, "warn").mockImplementation(() => {});
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn().mockResolvedValue(market),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn().mockResolvedValue([]) },
      { listByTicker: vi.fn().mockResolvedValue([]), save: vi.fn() },
      {
        getComparisonMetadata: vi.fn().mockRejectedValue(new Error("offline")),
        getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null),
      },
    );

    await expect(
      service.getByTicker("PETR4", "request-id"),
    ).resolves.toMatchObject({
      ticker: "PETR4",
    });
    expect(warn).toHaveBeenCalledWith(
      "stock_analysis_issuer_lookup_failed",
      expect.objectContaining({ requestId: "request-id" }),
    );
    warn.mockRestore();
  });

  it("continues analysis when historical validated quote lookup fails", async () => {
    const logger = await import("@/infrastructure/logging/logger");
    const warn = vi.spyOn(logger.logger, "warn").mockImplementation(() => {});
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn().mockResolvedValue(null),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn().mockResolvedValue([]) },
      { listByTicker: vi.fn().mockResolvedValue([]), save: vi.fn() },
      {
        getComparisonMetadata: vi.fn().mockResolvedValue([]),
        getValidatedAnalysisQuote: vi
          .fn()
          .mockRejectedValue(new Error("offline")),
      },
    );

    await expect(service.getByTicker("PETR4")).rejects.toMatchObject({
      statusCode: 502,
    });
    expect(warn).toHaveBeenCalledWith(
      "stock_analysis_last_quote_lookup_failed",
      expect.objectContaining({ ticker: "PETR4" }),
    );
    warn.mockRestore();
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

  const sameBalanceReportedAsQuarterly = {
    ...periods[1]!,
    periodStart: "2026-04-01",
    periodBasis: "quarterly" as const,
    equity: periods[1]!.equity,
  };
  expect(
    calculateAnalysisIndicators(
      [...periods, sameBalanceReportedAsQuarterly],
      240,
    ).find(({ key }) => key === "roe"),
  ).toMatchObject({ value: 30 });

  const conflictingSameCutoffBalance = {
    ...sameBalanceReportedAsQuarterly,
    equity: "91",
  };
  expect(
    calculateAnalysisIndicators(
      [...periods, conflictingSameCutoffBalance],
      240,
    ).find(({ key }) => key === "roe"),
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

it("reconciles ITUB4 LTM ROE when the same CVM balance is reported twice", () => {
  const base = {
    periodType: "interim" as const,
    sourceDocument: "ITR" as const,
    periodBasis: "year_to_date" as const,
    filingReferenceDate: "2026-08-10",
    equityVersion: "1",
    equityAccount: "2.07",
    equityConcept: "consolidated_equity",
    revenue: null,
    revenueVersion: null,
    revenueAccountLabel: null,
    assets: null,
    liabilities: null,
    cash: null,
    debt: null,
  };
  const periods = [
    {
      ...base,
      referenceDate: "2025-12-31",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      periodType: "annual" as const,
      sourceDocument: "DFP" as const,
      periodBasis: "annual" as const,
      filingReferenceDate: "2026-03-20",
      exerciseOrder: "last" as const,
      netIncome: "45849000",
      netIncomeVersion: "1",
      netIncomeAccount: "3.09",
      netIncomeConcept: "consolidated_net_income",
      equity: "210000000",
      equityVersion: "1",
    },
    {
      ...base,
      referenceDate: "2026-06-30",
      periodStart: "2026-01-01",
      periodEnd: "2026-06-30",
      exerciseOrder: "last" as const,
      netIncome: "24199000",
      netIncomeVersion: "1",
      netIncomeAccount: "3.09",
      netIncomeConcept: "consolidated_net_income",
      equity: "228026000",
    },
    {
      ...base,
      referenceDate: "2025-06-30",
      periodStart: "2025-01-01",
      periodEnd: "2025-06-30",
      exerciseOrder: "previous" as const,
      netIncome: "22105000",
      netIncomeVersion: "1",
      netIncomeAccount: "3.09",
      netIncomeConcept: "consolidated_net_income",
      equity: "218451000",
    },
  ];
  const quarterlyBalance = {
    ...periods[1]!,
    periodStart: "2026-04-01",
    periodBasis: "quarterly" as const,
  };

  expect(
    calculateAnalysisIndicators([...periods, quarterlyBalance], 240).find(
      ({ key }) => key === "roe",
    ),
  ).toMatchObject({
    value: expect.closeTo(21.48, 2),
    referenceDate: "2026-06-30",
    periodBasis: "trailing_twelve_months",
  });
  expect(
    calculateAnalysisIndicators(
      [...periods, { ...quarterlyBalance, equity: "228027000" }],
      240,
    ).find(({ key }) => key === "roe"),
  ).toMatchObject({ value: null });
});

it("uses the exact prior-year ITR equity when period end is implicit", () => {
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
      revenue: "500",
      revenueVersion: "dfp-7",
      revenueAccountLabel: "Receita operacional consolidada",
      netIncome: "180",
      netIncomeVersion: "dfp-4",
      netIncomeAccount: "3.09",
      netIncomeConcept: "consolidated_net_income",
      equity: "150",
      equityVersion: "dfp-3",
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
      revenue: "260",
      revenueVersion: "itr-1",
      revenueAccountLabel: "Receita operacional consolidada",
      netIncome: "100",
      netIncomeVersion: "itr-1",
      netIncomeAccount: "3.09",
      netIncomeConcept: "consolidated_net_income",
      equity: "200",
      equityVersion: "itr-1",
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
      revenue: "140",
      revenueVersion: "itr-1",
      revenueAccountLabel: "Receita operacional consolidada",
      netIncome: "40",
      netIncomeVersion: "itr-1",
      netIncomeAccount: "3.09",
      netIncomeConcept: "consolidated_net_income",
      equity: null,
      equityVersion: null,
      equityAccount: null,
      equityConcept: null,
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
    },
    {
      referenceDate: "2025-06-30",
      periodStart: null,
      filingReferenceDate: "2025-08-07",
      exerciseOrder: "last" as const,
      periodBasis: "unknown" as const,
      periodType: "interim" as const,
      sourceDocument: "ITR" as const,
      revenue: null,
      revenueVersion: null,
      revenueAccountLabel: null,
      netIncome: null,
      netIncomeVersion: null,
      netIncomeAccount: null,
      netIncomeConcept: null,
      equity: "80",
      equityVersion: "different-filing-version",
      equityAccount: "2.07",
      equityConcept: "consolidated_equity",
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
    },
  ];

  expect(
    calculateAnalysisIndicators(periods).find(({ key }) => key === "roe"),
  ).toMatchObject({
    value: expect.closeTo(171.43, 2),
    referenceDate: "2026-06-30",
  });
  expect(
    calculateAnalysisIndicators(
      periods.filter(
        (period) =>
          period.sourceDocument !== "ITR" || period.periodEnd !== "2025-06-30",
      ),
    ).find(({ key }) => key === "roe"),
  ).toMatchObject({ value: null });

  const currentFilingComparator = {
    ...periods[2]!,
    equity: "100",
    equityVersion: "itr-1",
    equityAccount: "2.07",
    equityConcept: "consolidated_equity",
  };
  expect(
    calculateAnalysisIndicators(
      periods.map((period, index) =>
        index === 2 ? currentFilingComparator : period,
      ),
    ).find(({ key }) => key === "roe"),
  ).toMatchObject({ value: expect.closeTo(160, 2) });

  expect(
    calculateAnalysisIndicators([
      ...periods.slice(0, 2),
      { ...currentFilingComparator, equityVersion: "itr-2" },
      periods[3]!,
    ]).find(({ key }) => key === "roe"),
  ).toMatchObject({ value: null });

  expect(
    calculateAnalysisIndicators([
      ...periods,
      {
        ...periods[2]!,
        periodStart: null,
        periodBasis: "unknown" as const,
        revenue: null,
        revenueVersion: null,
        revenueAccountLabel: null,
        netIncome: null,
        netIncomeVersion: null,
        netIncomeAccount: null,
        netIncomeConcept: null,
        equity: "100",
        equityVersion: "itr-1",
        equityAccount: "2.07",
        equityConcept: "consolidated_equity",
      },
      {
        ...periods[2]!,
        periodStart: null,
        periodBasis: "unknown" as const,
        revenue: null,
        revenueVersion: null,
        revenueAccountLabel: null,
        netIncome: null,
        netIncomeVersion: null,
        netIncomeAccount: null,
        netIncomeConcept: null,
        equity: "110",
        equityVersion: "itr-1",
        equityAccount: "2.07",
        equityConcept: "consolidated_equity",
      },
    ]).find(({ key }) => key === "roe"),
  ).toMatchObject({ value: null });
});

it("keeps CSAN3 margin and P/VP when the opening equity needed for ROE is unavailable", () => {
  const common = {
    revenueVersion: "1",
    revenueAccountLabel: "Receita operacional consolidada",
    netIncomeVersion: "1",
    netIncomeAccount: "3.11",
    netIncomeConcept: "consolidated_net_income",
    equityVersion: "1",
    equityAccount: "2.07",
    equityConcept: "consolidated_equity",
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
        revenue: "120",
        netIncome: "12",
        equity: null,
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
        revenue: "70",
        netIncome: "8",
        equity: "500",
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
        revenue: "50",
        netIncome: "5",
        equity: null,
      },
    ],
    1000,
  );

  expect(indicators).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ key: "netMargin", value: (15 / 140) * 100 }),
      expect.objectContaining({ key: "pb", value: 2 }),
      expect.objectContaining({ key: "roe", value: null }),
    ]),
  );
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

it("makes P/VP unavailable for conflicting balances at the latest cutoff", () => {
  const balance = {
    referenceDate: "2025-06-30",
    periodStart: "2025-01-01",
    periodEnd: "2025-06-30",
    filingReferenceDate: "2025-08-10",
    sourceDocument: "ITR" as const,
    periodType: "interim" as const,
    periodBasis: "year_to_date" as const,
    exerciseOrder: "last" as const,
    equity: "100",
    equityVersion: "2",
    equityAccount: "2.07",
    equityConcept: "consolidated_equity",
    revenue: null,
    netIncome: null,
    assets: null,
    liabilities: null,
    cash: null,
    debt: null,
  };
  const quarterlyEquivalent = {
    ...balance,
    periodStart: "2025-04-01",
    periodBasis: "quarterly" as const,
  };

  expect(
    calculateAnalysisIndicators([balance, quarterlyEquivalent], 200).find(
      ({ key }) => key === "pb",
    ),
  ).toMatchObject({ value: 2, referenceDate: "2025-06-30" });
  expect(
    calculateAnalysisIndicators(
      [balance, { ...quarterlyEquivalent, equity: "110" }],
      200,
    ).find(({ key }) => key === "pb"),
  ).toMatchObject({
    value: null,
    referenceDate: null,
    unavailableReason:
      "Indisponível: há saldos de patrimônio líquido conflitantes em 2025-06-30; não foi possível reconciliar o P/VP.",
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

  const expiredCachePeriod = (overrides: Record<string, unknown> = {}) => ({
    referenceDate: "2025-12-31",
    periodStart: "2025-01-01",
    periodEnd: "2025-12-31",
    filingReferenceDate: "2026-03-20",
    exerciseOrder: "last",
    periodBasis: "annual",
    periodType: "annual",
    sourceDocument: "DFP",
    cnpj: "33000167000101",
    sourceVersion: "2026",
    revenueVersion: "1",
    revenueAccountLabel: "Receita operacional consolidada",
    netIncomeVersion: "1",
    netIncomeAccount: "3.09",
    netIncomeConcept: "consolidated_net_income",
    equityVersion: "1",
    equityAccount: "2.03",
    equityConcept: "consolidated_equity",
    revenue: "100",
    netIncome: "10",
    equity: "50",
    assets: null,
    liabilities: null,
    cash: null,
    debt: null,
    fetchedAt: new Date(Date.now() - 1000 * 60 * 60 * 25),
    ...overrides,
  });

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

  it("rejects mismatched market tickers instead of returning another issuer", async () => {
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn().mockResolvedValue({ ...market, ticker: "VALE3" }),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn(), save: vi.fn() },
      { getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null) },
    );

    await expect(service.getByTicker("PETR4")).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it("preserves application errors when the market provider is unavailable", async () => {
    const failure = new ApplicationError("Market rate limited", 429, 30);
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn().mockRejectedValue(failure),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn(), save: vi.fn() },
      { getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null) },
    );

    await expect(service.getByTicker("PETR4")).rejects.toBe(failure);
  });

  it("refreshes a recent cache entry with an old normalization revision", async () => {
    const marketProvider = {
      getByTicker: vi.fn().mockResolvedValue(market),
      getQuoteByTicker: vi.fn(),
      searchTickers: vi.fn(),
    };
    const fundamentalsProvider = {
      getByTicker: vi.fn().mockResolvedValue([
        {
          referenceDate: "2025-12-31",
          periodStart: "2025-01-01",
          periodEnd: "2025-12-31",
          filingReferenceDate: "2026-03-20",
          exerciseOrder: "last",
          periodBasis: "annual",
          periodType: "annual",
          sourceDocument: "DFP",
          revenue: "200",
          netIncome: "20",
          equity: "100",
          assets: null,
          liabilities: null,
          cash: null,
          debt: null,
        },
      ]),
    };
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([
        expiredCachePeriod({
          fetchedAt: new Date(),
          sourceVersion: String(new Date().getUTCFullYear()),
        }),
      ]),
      save: vi.fn(),
    };
    const service = new StockAnalysisService(
      marketProvider,
      fundamentalsProvider,
      repository,
      rejectedScreenerLookups(),
    );

    await service.getByTicker("PETR4");

    expect(fundamentalsProvider.getByTicker).toHaveBeenCalledOnce();
    expect(repository.save).toHaveBeenCalledWith(
      "PETR4",
      "33000167000101",
      `${new Date().getUTCFullYear()}-cvm-v4`,
      expect.any(Array),
    );
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
      cnpj: "33000167000101",
      sourceVersion: `${new Date().getUTCFullYear()}-cvm-v4`,
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
      listByTicker: vi.fn().mockResolvedValue([
        cachedPeriod,
        { ...cachedPeriod, revenue: "105" },
        {
          ...cachedPeriod,
          filingReferenceDate: "2025-04-01",
          revenue: "110",
        },
        {
          ...cachedPeriod,
          filingReferenceDate: "2025-04-01",
          revenue: "115",
        },
        legacyInterimPeriod,
        comparativeInterimPeriod,
      ]),
      save: vi.fn(),
    };
    const service = new StockAnalysisService(
      marketProvider,
      fundamentalsProvider,
      repository,
      rejectedScreenerLookups(),
    );

    const result = await service.getByTicker(" petr4 ");

    expect(result.fundamentals).toEqual([
      {
        referenceDate: "2025-12-31",
        periodStart: null,
        periodEnd: "2025-12-31",
        filingReferenceDate: "2025-04-01",
        exerciseOrder: "last",
        periodBasis: "annual",
        isDerived: false,
        periodType: "annual",
        sourceDocument: "DFP",
        revenue: "110",
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

  it("uses an expired CNPJ-matched cache with complete CVM provenance when refresh fails", async () => {
    const fetchedAt = new Date(Date.now() - 1000 * 60 * 60 * 25);
    const cachedPeriod = {
      referenceDate: "2025-12-31",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      filingReferenceDate: "2026-03-20",
      exerciseOrder: "last",
      periodBasis: "annual",
      periodType: "annual",
      sourceDocument: "DFP",
      cnpj: "33000167000101",
      sourceVersion: "2026",
      revenueVersion: "1",
      revenueAccountLabel: "Receita operacional consolidada",
      netIncomeVersion: "1",
      netIncomeAccount: "3.09",
      netIncomeConcept: "consolidated_net_income",
      equityVersion: "1",
      equityAccount: "2.03",
      equityConcept: "consolidated_equity",
      revenue: "100",
      netIncome: "10",
      equity: "50",
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
      fetchedAt,
    };
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([cachedPeriod]),
      save: vi.fn(),
    };
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn().mockResolvedValue(market),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn().mockRejectedValue(new Error("CVM unavailable")) },
      repository,
      { getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null) },
    );

    const result = await service.getByTicker("PETR4");

    expect(result).toMatchObject({
      fundamentalsIsStale: true,
      fundamentalsFetchedAt: fetchedAt.toISOString(),
      fundamentals: [
        expect.objectContaining({
          referenceDate: "2025-12-31",
          filingReferenceDate: "2026-03-20",
          revenue: "100",
        }),
      ],
    });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("uses a valid stale cache when CVM refresh succeeds without periods", async () => {
    const cachedPeriod = expiredCachePeriod({ periodEnd: null });
    const fetchedAt = cachedPeriod.fetchedAt;
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([cachedPeriod]),
      save: vi.fn(),
    };
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn().mockResolvedValue(market),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn().mockResolvedValue([]) },
      repository,
      { getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null) },
    );

    const result = await service.getByTicker("PETR4");

    expect(result).toMatchObject({
      fundamentalsIsStale: true,
      fundamentalsFetchedAt: fetchedAt.toISOString(),
      fundamentals: [expect.objectContaining({ periodEnd: "2025-12-31" })],
    });
  });

  it("accepts an expired ITR cache only with interim period provenance", async () => {
    const cachedPeriod = expiredCachePeriod({
      referenceDate: "2026-06-30",
      periodStart: "2026-01-01",
      periodEnd: "2026-06-30",
      filingReferenceDate: "2026-08-10",
      periodType: "interim",
      periodBasis: "year_to_date",
      sourceDocument: "ITR",
    });
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn().mockResolvedValue(market),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn().mockRejectedValue(new Error("CVM unavailable")) },
      {
        listByTicker: vi.fn().mockResolvedValue([cachedPeriod]),
        save: vi.fn(),
      },
      { getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null) },
    );

    await expect(service.getByTicker("PETR4")).resolves.toMatchObject({
      fundamentalsIsStale: true,
      fundamentals: [expect.objectContaining({ sourceDocument: "ITR" })],
    });
  });

  it.each([
    ["revenue version", { revenueVersion: null }],
    ["revenue label", { revenueAccountLabel: " " }],
    ["net income account", { netIncomeAccount: null }],
    ["equity concept", { equityConcept: null }],
    ["period start", { periodStart: "not-a-date" }],
    ["reported end date", { periodEnd: "2025-11-30" }],
    ["filing date", { filingReferenceDate: null }],
    [
      "interim basis",
      {
        referenceDate: "2026-06-30",
        periodStart: "2026-01-01",
        periodEnd: "2026-06-30",
        filingReferenceDate: "2026-08-10",
        periodType: "interim",
        periodBasis: "unknown",
        sourceDocument: "ITR",
      },
    ],
    [
      "interim type",
      {
        referenceDate: "2026-06-30",
        periodStart: "2026-01-01",
        periodEnd: "2026-06-30",
        filingReferenceDate: "2026-08-10",
        periodType: "annual",
        periodBasis: "quarterly",
        sourceDocument: "ITR",
      },
    ],
  ])(
    "rejects an expired cache with incomplete %s provenance",
    async (_field, change) => {
      const service = new StockAnalysisService(
        {
          getByTicker: vi.fn().mockResolvedValue(market),
          getQuoteByTicker: vi.fn(),
          searchTickers: vi.fn(),
        },
        {
          getByTicker: vi.fn().mockRejectedValue(new Error("CVM unavailable")),
        },
        {
          listByTicker: vi.fn().mockResolvedValue([expiredCachePeriod(change)]),
          save: vi.fn(),
        },
        { getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null) },
      );

      await expect(service.getByTicker("PETR4")).rejects.toMatchObject({
        statusCode: 502,
      });
    },
  );

  it("does not use stale fundamentals cache without an issuer CNPJ", async () => {
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn().mockResolvedValue({ ...market, cnpj: null }),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn().mockRejectedValue(new Error("CVM unavailable")) },
      {
        listByTicker: vi.fn().mockResolvedValue([expiredCachePeriod()]),
        save: vi.fn(),
      },
      { getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null) },
    );

    await expect(service.getByTicker("PETR4")).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it("does not use an expired cache when CNPJ or CVM provenance does not match", async () => {
    const cachedPeriod = {
      referenceDate: "2025-12-31",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      filingReferenceDate: "2026-03-20",
      exerciseOrder: "last",
      periodBasis: "annual",
      periodType: "annual",
      sourceDocument: "DFP",
      cnpj: "99000167000101",
      sourceVersion: "2026",
      revenueVersion: null,
      revenueAccountLabel: null,
      netIncomeVersion: null,
      netIncomeAccount: null,
      netIncomeConcept: null,
      equityVersion: null,
      equityAccount: null,
      equityConcept: null,
      revenue: "100",
      netIncome: null,
      equity: null,
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
      fetchedAt: new Date(Date.now() - 1000 * 60 * 60 * 25),
    };
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn().mockResolvedValue(market),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn().mockRejectedValue(new Error("CVM unavailable")) },
      {
        listByTicker: vi.fn().mockResolvedValue([cachedPeriod]),
        save: vi.fn(),
      },
      { getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null) },
    );

    await expect(service.getByTicker("PETR4")).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it("uses a fresh validated Screener quote as an explicitly stale last observation", async () => {
    const observedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const screener = {
      getValidatedAnalysisQuote: vi.fn().mockResolvedValue({
        ticker: "PETR4",
        returnedTicker: "PETR4",
        issuerCnpj: "33000167000101",
        companyName: "Petrobras",
        price: "31.25",
        marketCap: "300000000000.00",
        quoteObservedAt: observedAt,
        snapshotMarketCap: "300000000000.00",
        snapshotObservedAt: observedAt,
        snapshotQuoteObservedAt: observedAt,
      }),
    };
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([]),
      save: vi.fn(),
    };
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn().mockRejectedValue(new Error("market offline")),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn().mockResolvedValue([]) },
      repository,
      screener,
    );

    const result = await service.getByTicker("PETR4");

    expect(result).toMatchObject({
      ticker: "PETR4",
      cnpj: "33000167000101",
      price: 31.25,
      marketCap: 300000000000,
      changePercent: null,
      priceUpdatedAt: observedAt.toISOString(),
      priceIsStale: true,
      history: [],
    });
  });

  it.each(["expired", "future"])(
    "replaces a %s provider quote with a fresh validated Screener quote",
    async (timestampKind) => {
      const observedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const providerObservedAt = new Date(
        Date.now() +
          (timestampKind === "future" ? 24 : -8) *
            60 *
            60 *
            1000 *
            (timestampKind === "future" ? 1 : 24),
      );
      const screenerQuote = {
        ticker: "PETR4",
        returnedTicker: "PETR4",
        issuerCnpj: "33000167000101",
        companyName: "Petrobras",
        price: "31.25",
        marketCap: "300000000000.00",
        quoteObservedAt: observedAt,
        snapshotMarketCap: "300000000000.00",
        snapshotObservedAt: observedAt,
        snapshotQuoteObservedAt: observedAt,
      };
      const screener = {
        getValidatedAnalysisQuote: vi.fn().mockResolvedValue(screenerQuote),
      };
      const repository = {
        listByTicker: vi.fn().mockResolvedValue([]),
        save: vi.fn(),
      };
      const service = new StockAnalysisService(
        {
          getByTicker: vi.fn().mockResolvedValue({
            ...market,
            price: 29,
            priceUpdatedAt: providerObservedAt.toISOString(),
          }),
          getQuoteByTicker: vi.fn(),
          searchTickers: vi.fn(),
        },
        { getByTicker: vi.fn().mockResolvedValue([]) },
        repository,
        screener,
      );

      const result = await service.getByTicker("PETR4");

      expect(result).toMatchObject({
        price: 31.25,
        marketCap: 300000000000,
        priceUpdatedAt: observedAt.toISOString(),
        priceIsStale: true,
      });
    },
  );

  it("rejects stale, mismatched, or issuer-unverified Screener quote evidence", async () => {
    const tooOld = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const screener = {
      getValidatedAnalysisQuote: vi.fn().mockResolvedValue({
        ticker: "PETR4",
        returnedTicker: "PETR4",
        issuerCnpj: "33000167000101",
        companyName: "Petrobras",
        price: "31.25",
        marketCap: "300000000000.00",
        quoteObservedAt: tooOld,
        snapshotMarketCap: "300000000000.00",
        snapshotObservedAt: tooOld,
        snapshotQuoteObservedAt: tooOld,
      }),
    };
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn().mockRejectedValue(new Error("market offline")),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn(), save: vi.fn() },
      screener,
    );

    await expect(service.getByTicker("PETR4")).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it.each([
    ["requested ticker", { ticker: "VALE3" }],
    ["returned ticker", { returnedTicker: "VALE3" }],
    ["snapshot market cap", { snapshotMarketCap: "300000000000.01" }],
    ["snapshot quote timestamp", { snapshotQuoteObservedAt: null }],
    [
      "future quote timestamp",
      { quoteObservedAt: new Date(Date.now() + 60_000) },
    ],
    [
      "future snapshot timestamp",
      { snapshotObservedAt: new Date(Date.now() + 60_000) },
    ],
  ])(
    "rejects last-observed quote evidence with mismatched %s",
    async (_case, change) => {
      const observedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const row = {
        ticker: "PETR4",
        returnedTicker: "PETR4",
        issuerCnpj: "33000167000101",
        companyName: "Petrobras",
        price: "31.25",
        marketCap: "300000000000.00",
        quoteObservedAt: observedAt,
        snapshotMarketCap: "300000000000.00",
        snapshotObservedAt: observedAt,
        snapshotQuoteObservedAt: observedAt,
        ...change,
      };
      const service = new StockAnalysisService(
        {
          getByTicker: vi.fn().mockRejectedValue(new Error("market offline")),
          getQuoteByTicker: vi.fn(),
          searchTickers: vi.fn(),
        },
        { getByTicker: vi.fn() },
        { listByTicker: vi.fn(), save: vi.fn() },
        { getValidatedAnalysisQuote: vi.fn().mockResolvedValue(row) },
      );

      await expect(service.getByTicker("PETR4")).rejects.toMatchObject({
        statusCode: 502,
      });
    },
  );

  it("does not replace a missing quote with evidence from another issuer", async () => {
    const observedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const marketWithoutQuote = { ...market, price: null };
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([]),
      save: vi.fn(),
    };
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn().mockResolvedValue(marketWithoutQuote),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn().mockResolvedValue([]) },
      repository,
      {
        getValidatedAnalysisQuote: vi.fn().mockResolvedValue({
          ticker: "PETR4",
          returnedTicker: "PETR4",
          issuerCnpj: "99000167000101",
          companyName: "Outra empresa",
          price: "31.25",
          marketCap: "300000000000.00",
          quoteObservedAt: observedAt,
          snapshotMarketCap: "300000000000.00",
          snapshotObservedAt: observedAt,
          snapshotQuoteObservedAt: observedAt,
        }),
      },
    );

    const result = await service.getByTicker("PETR4");
    expect(result.price).toBeNull();
    expect(result.priceIsStale).toBe(false);
  });

  it.each(["source version", "period provenance", "retrieval timestamp"])(
    "rejects an expired cache with inconsistent %s",
    async (inconsistentField) => {
      const fetchedAt = new Date(Date.now() - 1000 * 60 * 60 * 25);
      const latest = {
        referenceDate: "2025-12-31",
        periodStart: "2025-01-01",
        periodEnd: "2025-12-31",
        filingReferenceDate: "2026-03-20",
        exerciseOrder: "last",
        periodBasis: "annual",
        periodType: "annual",
        sourceDocument: "DFP",
        cnpj: "33000167000101",
        sourceVersion: "2026",
        revenueVersion: "1",
        revenueAccountLabel: "Receita operacional consolidada",
        netIncomeVersion: null,
        netIncomeAccount: null,
        netIncomeConcept: null,
        equityVersion: null,
        equityAccount: null,
        equityConcept: null,
        revenue: "100",
        netIncome: null,
        equity: null,
        assets: null,
        liabilities: null,
        cash: null,
        debt: null,
        fetchedAt,
      };
      const older = {
        ...latest,
        referenceDate: "2024-12-31",
        periodStart: "2024-01-01",
        periodEnd: "2024-12-31",
        filingReferenceDate:
          inconsistentField === "period provenance" ? null : "2025-03-20",
        sourceVersion: inconsistentField === "source version" ? "2025" : "2026",
        fetchedAt:
          inconsistentField === "retrieval timestamp"
            ? new Date(fetchedAt.getTime() + 1)
            : fetchedAt,
      };
      const service = new StockAnalysisService(
        {
          getByTicker: vi.fn().mockResolvedValue(market),
          getQuoteByTicker: vi.fn(),
          searchTickers: vi.fn(),
        },
        {
          getByTicker: vi.fn().mockRejectedValue(new Error("CVM unavailable")),
        },
        {
          listByTicker: vi.fn().mockResolvedValue([latest, older]),
          save: vi.fn(),
        },
        { getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null) },
      );

      await expect(service.getByTicker("PETR4")).rejects.toMatchObject({
        statusCode: 502,
      });
    },
  );

  it("loads issuer fundamentals from an identity-matched cache without market data", async () => {
    const cachedPeriod = {
      referenceDate: "2025-12-31",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      filingReferenceDate: null,
      exerciseOrder: "last",
      periodBasis: "annual",
      periodType: "annual",
      sourceDocument: "DFP",
      cnpj: "33000167000101",
      sourceVersion: `${new Date().getUTCFullYear()}-cvm-v4`,
      revenue: "100",
      netIncome: "10",
      equity: "50",
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
      fetchedAt: new Date(),
    };
    const marketProvider = {
      getByTicker: vi.fn().mockRejectedValue(new Error("market unavailable")),
      getQuoteByTicker: vi.fn(),
      searchTickers: vi.fn(),
    };
    const fundamentalsProvider = { getByTicker: vi.fn() };
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([cachedPeriod]),
      save: vi.fn(),
    };
    const service = new StockAnalysisService(
      marketProvider,
      fundamentalsProvider,
      repository,
    );

    const result = await service.getFundamentalsByIssuer(
      "PETR4",
      "33.000.167/0001-01",
    );

    expect(result).toMatchObject({
      ticker: "PETR4",
      cnpj: "33000167000101",
      price: null,
      marketCap: null,
      priceUpdatedAt: null,
      fundamentals: [expect.objectContaining({ referenceDate: "2025-12-31" })],
    });
    expect(marketProvider.getByTicker).not.toHaveBeenCalled();
    expect(fundamentalsProvider.getByTicker).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("refreshes a fresh cache when its CNPJ differs from the expected issuer", async () => {
    const cachedPeriod = {
      referenceDate: "2025-12-31",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      filingReferenceDate: null,
      exerciseOrder: "last",
      periodBasis: "annual",
      periodType: "annual",
      sourceDocument: "DFP",
      cnpj: "99000167000101",
      revenue: "100",
      netIncome: "10",
      equity: "50",
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
      fetchedAt: new Date(),
    };
    const refreshed = {
      referenceDate: "2025-12-31",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      filingReferenceDate: "2026-03-20",
      exerciseOrder: "last" as const,
      periodBasis: "annual" as const,
      periodType: "annual" as const,
      sourceDocument: "DFP" as const,
      revenue: "200",
      netIncome: "20",
      equity: "100",
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
    };
    const marketProvider = {
      getByTicker: vi.fn(),
      getQuoteByTicker: vi.fn(),
      searchTickers: vi.fn(),
    };
    const fundamentalsProvider = {
      getByTicker: vi.fn().mockResolvedValue([refreshed]),
    };
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([cachedPeriod]),
      save: vi.fn(),
    };
    const service = new StockAnalysisService(
      marketProvider,
      fundamentalsProvider,
      repository,
    );

    const result = await service.getFundamentalsByIssuer(
      "PETR4",
      "33000167000101",
    );

    expect(fundamentalsProvider.getByTicker).toHaveBeenCalledWith({
      ticker: "PETR4",
      cnpj: "33000167000101",
    });
    expect(repository.save).toHaveBeenCalledWith(
      "PETR4",
      "33000167000101",
      expect.any(String),
      [refreshed],
    );
    expect(result.fundamentals[0]?.netIncome).toBe("20");
    expect(marketProvider.getByTicker).not.toHaveBeenCalled();
  });

  it("refreshes stale issuer cache and rejects invalid issuer identity", async () => {
    const stalePeriod = {
      referenceDate: "2025-12-31",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      filingReferenceDate: null,
      exerciseOrder: "last",
      periodBasis: "annual",
      periodType: "annual",
      sourceDocument: "DFP",
      cnpj: "33000167000101",
      revenue: "100",
      netIncome: "10",
      equity: "50",
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
      fetchedAt: new Date(Date.now() - 1000 * 60 * 60 * 25),
    };
    const marketProvider = {
      getByTicker: vi.fn(),
      getQuoteByTicker: vi.fn(),
      searchTickers: vi.fn(),
    };
    const fundamentalsProvider = { getByTicker: vi.fn().mockResolvedValue([]) };
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([stalePeriod]),
      save: vi.fn(),
    };
    const service = new StockAnalysisService(
      marketProvider,
      fundamentalsProvider,
      repository,
    );

    await service.getFundamentalsByIssuer("PETR4", "33000167000101");
    expect(fundamentalsProvider.getByTicker).toHaveBeenCalledOnce();
    expect(repository.save).toHaveBeenCalledOnce();
    await expect(
      service.getFundamentalsByIssuer("PETR4", "invalid"),
    ).rejects.toMatchObject({ statusCode: 422 });
    await expect(
      service.getFundamentalsByIssuer("PETR4", undefined),
    ).rejects.toMatchObject({ statusCode: 422 });
    await expect(
      service.getFundamentalsByIssuer("bad", "33000167000101"),
    ).rejects.toMatchObject({ statusCode: 400 });
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
      { getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null) },
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

  it("resolves a missing BRAPI profile CNPJ from the exact active ticker on first and repeated requests", async () => {
    const marketWithoutProfile = {
      ...market,
      cnpj: null,
      priceUpdatedAt: new Date().toISOString(),
    };
    const marketProvider = {
      getByTicker: vi.fn().mockResolvedValue(marketWithoutProfile),
      getQuoteByTicker: vi.fn(),
      searchTickers: vi.fn(),
    };
    const fundamentalsProvider = {
      getByTicker: vi.fn().mockResolvedValue([]),
    };
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([]),
      save: vi.fn(),
    };
    const screener = {
      getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null),
      getComparisonMetadata: vi.fn().mockResolvedValue([
        {
          ticker: "PETR4",
          cnpj: "33.000.167/0001-01",
          subType: "stock",
          sector: "Energia elétrica",
          issuerMetadataUpdatedAt: new Date("2026-10-01T00:00:00.000Z"),
        },
      ]),
    };
    const service = new StockAnalysisService(
      marketProvider,
      fundamentalsProvider,
      repository,
      screener,
    );

    await expect(service.getByTicker("PETR4")).resolves.toMatchObject({
      ticker: "PETR4",
      cnpj: "33000167000101",
      issuerSector: "Energia elétrica",
      issuerMetadataUpdatedAt: new Date("2026-10-01T00:00:00.000Z"),
      instrumentType: "stock",
    });
    await expect(service.getByTicker("PETR4")).resolves.toMatchObject({
      ticker: "PETR4",
      cnpj: "33000167000101",
    });
    expect(screener.getComparisonMetadata).toHaveBeenCalledTimes(2);
    expect(screener.getComparisonMetadata).toHaveBeenCalledWith(["PETR4"]);
    expect(fundamentalsProvider.getByTicker).toHaveBeenCalledTimes(2);
    expect(fundamentalsProvider.getByTicker).toHaveBeenNthCalledWith(1, {
      ticker: "PETR4",
      cnpj: "33000167000101",
    });
  });

  it("keeps a uniquely matched unit sector but does not classify it as stock", async () => {
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn().mockResolvedValue({
          ...market,
          cnpj: null,
          priceUpdatedAt: new Date().toISOString(),
        }),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn().mockResolvedValue([]) },
      { listByTicker: vi.fn().mockResolvedValue([]), save: vi.fn() },
      {
        getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null),
        getComparisonMetadata: vi.fn().mockResolvedValue([
          {
            ticker: "PETR4",
            cnpj: "33000167000101",
            subType: "unit",
            sector: "Energia elétrica",
            issuerMetadataUpdatedAt: new Date("2026-10-02T00:00:00.000Z"),
          },
        ]),
      },
    );

    await expect(service.getByTicker("PETR4")).resolves.toMatchObject({
      issuerSector: "Energia elétrica",
      issuerMetadataUpdatedAt: new Date("2026-10-02T00:00:00.000Z"),
      instrumentType: "unknown",
    });
  });

  it("leaves type, sector and reference date unknown for ambiguous CVM matches", async () => {
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn().mockResolvedValue({
          ...market,
          cnpj: null,
          priceUpdatedAt: new Date().toISOString(),
        }),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn().mockResolvedValue([]) },
      { listByTicker: vi.fn().mockResolvedValue([]), save: vi.fn() },
      {
        getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null),
        getComparisonMetadata: vi.fn().mockResolvedValue([
          {
            ticker: "PETR4",
            cnpj: "33000167000101",
            subType: "stock",
            sector: "Energia elétrica",
            issuerMetadataUpdatedAt: new Date("2026-10-02T00:00:00.000Z"),
          },
          {
            ticker: "PETR4",
            cnpj: "33000167000101",
            subType: "unit",
            sector: "Energia elétrica",
            issuerMetadataUpdatedAt: new Date("2026-10-03T00:00:00.000Z"),
          },
        ]),
      },
    );

    await expect(service.getByTicker("PETR4")).resolves.toMatchObject({
      issuerSector: null,
      issuerMetadataUpdatedAt: null,
      instrumentType: "unknown",
    });
  });

  it("fails closed when an active ticker CNPJ conflicts with the BRAPI profile", async () => {
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn().mockResolvedValue(market),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn(), save: vi.fn() },
      {
        getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null),
        getComparisonMetadata: vi
          .fn()
          .mockResolvedValue([{ ticker: "PETR4", cnpj: "11222333000181" }]),
      },
    );

    await expect(service.getByTicker("PETR4")).rejects.toMatchObject({
      statusCode: 422,
      message: "Não foi possível confirmar o CNPJ do emissor para este ticker.",
    });
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
      rejectedScreenerLookups(),
    );

    await expect(service.getByTicker("PETR4")).rejects.toMatchObject({
      statusCode: 502,
      message:
        "Não foi possível consultar os demonstrativos oficiais da CVM agora.",
    });
  });

  it("shares concurrent fundamentals cache misses and persists the refresh once", async () => {
    let releaseProvider!: (periods: never[]) => void;
    const providerGate = new Promise<never[]>((resolve) => {
      releaseProvider = resolve;
    });
    const fundamentalsProvider = {
      getByTicker: vi.fn(() => providerGate),
    };
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      fundamentalsProvider,
      repository,
      rejectedScreenerLookups(),
    );

    const first = service.getFundamentalsByIssuer("PETR4", "33000167000101");
    const second = service.getFundamentalsByIssuer(
      "PETR4",
      "33.000.167/0001-01",
    );
    await vi.waitFor(() =>
      expect(repository.listByTicker).toHaveBeenCalledTimes(2),
    );
    await vi.waitFor(() =>
      expect(fundamentalsProvider.getByTicker).toHaveBeenCalledOnce(),
    );
    await Promise.resolve();
    releaseProvider([]);

    const results = await Promise.all([first, second]);
    expect(results.map((result) => result.cnpj)).toEqual([
      "33000167000101",
      "33000167000101",
    ]);
    expect(fundamentalsProvider.getByTicker).toHaveBeenCalledOnce();
    expect(repository.save).toHaveBeenCalledOnce();
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
