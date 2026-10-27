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

function validatedCapEvidence(marketCap: number) {
  return {
    marketCap,
    marketDataDate: "2026-10-16T15:00:00.000Z",
    source: "ScreenerRepository.getValidatedAnalysisQuote" as const,
    unavailableReason: "",
  };
}

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
      { listByTicker: vi.fn() },
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
      { listByTicker: vi.fn() },
    );
    await expect(service.searchTickers("A")).resolves.toEqual([]);
    expect(marketProvider.searchTickers).not.toHaveBeenCalled();
  });
});

describe("StockAnalysisService fundamentals refresh leases", () => {
  const issuerCnpj = "33000167000101";
  const ticker = "PETR4";
  const reportedPeriod = {
    referenceDate: "2025-12-31",
    periodStart: "2025-01-01",
    periodEnd: "2025-12-31",
    filingReferenceDate: "2026-03-01",
    exerciseOrder: "last" as const,
    periodBasis: "annual" as const,
    revenueVersion: "1",
    revenueAccountLabel: "Receita",
    netIncomeVersion: "1",
    netIncomeAccount: "3.11",
    netIncomeConcept: "consolidated_net_income" as const,
    equityVersion: "1",
    equityAccount: "2.03",
    equityConcept: "consolidated_equity" as const,
    periodType: "annual" as const,
    sourceDocument: "DFP" as const,
    revenue: "100",
    netIncome: "10",
    equity: "50",
    assets: null,
    liabilities: null,
    cash: null,
    debt: null,
  };

  it("claims a lease and persists provider results through the fenced completion", async () => {
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([]),
      getRefresh: vi.fn().mockResolvedValue({
        status: "running",
        retryAfter: null,
        errorCode: null,
      }),
      claimRefresh: vi.fn().mockResolvedValue("lease-token"),
      completeRefresh: vi.fn().mockResolvedValue(true),
      failRefresh: vi.fn(),
    };
    const fundamentalsProvider = {
      getByTicker: vi.fn().mockResolvedValue([reportedPeriod]),
    };
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      fundamentalsProvider,
      repository,
    );

    const refresh = await service.requestFundamentalsRefresh(
      ticker,
      issuerCnpj,
      "request-refresh",
    );
    expect(refresh).toMatchObject({
      claimed: true,
      state: { status: "running" },
    });
    expect(repository.getRefresh).not.toHaveBeenCalled();
    await refresh.run?.();

    expect(fundamentalsProvider.getByTicker).toHaveBeenCalledWith({
      ticker,
      cnpj: issuerCnpj,
    });
    expect(repository.completeRefresh).toHaveBeenCalledWith(
      ticker,
      issuerCnpj,
      expect.stringMatching(/^\d{4}-cvm-v8$/),
      "lease-token",
      [reportedPeriod],
    );
    expect(repository.failRefresh).not.toHaveBeenCalled();
  });

  it("does not report persisted periods when the lease fence rejects completion", async () => {
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([]),
      getRefresh: vi.fn().mockResolvedValue({
        status: "running",
        retryAfter: null,
        errorCode: null,
      }),
      claimRefresh: vi.fn().mockResolvedValue("lease-token"),
      completeRefresh: vi.fn().mockResolvedValue(false),
      failRefresh: vi.fn(),
    };
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn().mockResolvedValue([reportedPeriod]) },
      repository,
    );
    const refresh = await service.requestFundamentalsRefresh(
      ticker,
      issuerCnpj,
    );

    await refresh.run?.();

    expect(repository.completeRefresh).toHaveBeenCalledOnce();
    expect(repository.failRefresh).not.toHaveBeenCalled();
  });

  it("does not start a second provider call when a lease already exists", async () => {
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([]),
      getRefresh: vi.fn().mockResolvedValue({
        status: "running",
        retryAfter: null,
        errorCode: null,
      }),
      claimRefresh: vi.fn().mockResolvedValue(null),
      completeRefresh: vi.fn(),
      failRefresh: vi.fn(),
    };
    const fundamentalsProvider = { getByTicker: vi.fn() };
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      fundamentalsProvider,
      repository,
    );

    const refresh = await service.requestFundamentalsRefresh(
      ticker,
      issuerCnpj,
    );
    expect(refresh).toMatchObject({
      claimed: false,
      state: { status: "running" },
    });
    expect(refresh.run).toBeNull();
    expect(fundamentalsProvider.getByTicker).not.toHaveBeenCalled();
  });

  it("does not read refresh state after claiming a lease", async () => {
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([]),
      getRefresh: vi.fn().mockRejectedValue(new Error("database read failed")),
      claimRefresh: vi.fn().mockResolvedValue("lease-token"),
      completeRefresh: vi.fn(),
      failRefresh: vi.fn(),
    };
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn() },
      repository,
    );

    await expect(
      service.requestFundamentalsRefresh(ticker, issuerCnpj),
    ).resolves.toMatchObject({
      claimed: true,
      state: { status: "running" },
      run: expect.any(Function),
    });
    expect(repository.getRefresh).not.toHaveBeenCalled();
  });

  it("records safe provider failure and leaves cache persistence untouched", async () => {
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([]),
      getRefresh: vi.fn().mockResolvedValue({
        status: "running",
        retryAfter: null,
        errorCode: null,
      }),
      claimRefresh: vi.fn().mockResolvedValue("lease-token"),
      completeRefresh: vi.fn(),
      failRefresh: vi.fn(),
    };
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      {
        getByTicker: vi
          .fn()
          .mockRejectedValue(new Error("private provider detail")),
      },
      repository,
    );
    const refresh = await service.requestFundamentalsRefresh(
      ticker,
      issuerCnpj,
    );
    await refresh.run?.();

    expect(repository.failRefresh).toHaveBeenCalledWith(
      ticker,
      issuerCnpj,
      expect.stringMatching(/^\d{4}-cvm-v8$/),
      "lease-token",
      "PROVIDER_ERROR",
    );
    expect(repository.completeRefresh).not.toHaveBeenCalled();
  });

  it("records expected provider rejection without exposing provider details", async () => {
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([]),
      getRefresh: vi.fn().mockResolvedValue({
        status: "running",
        retryAfter: null,
        errorCode: null,
      }),
      claimRefresh: vi.fn().mockResolvedValue("lease-token"),
      completeRefresh: vi.fn(),
      failRefresh: vi.fn(),
    };
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      {
        getByTicker: vi
          .fn()
          .mockRejectedValue(
            new ApplicationError("Provider detail must stay private.", 502),
          ),
      },
      repository,
    );
    const refresh = await service.requestFundamentalsRefresh(
      ticker,
      issuerCnpj,
    );

    await refresh.run?.();

    expect(repository.failRefresh).toHaveBeenCalledWith(
      ticker,
      issuerCnpj,
      expect.stringMatching(/^\d{4}-cvm-v8$/),
      "lease-token",
      "PROVIDER_REJECTED",
    );
  });

  it("contains failure-recording errors inside the background refresh", async () => {
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([]),
      getRefresh: vi.fn().mockResolvedValue({
        status: "running",
        retryAfter: null,
        errorCode: null,
      }),
      claimRefresh: vi.fn().mockResolvedValue("lease-token"),
      completeRefresh: vi.fn(),
      failRefresh: vi.fn().mockRejectedValue(new Error("database offline")),
    };
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      {
        getByTicker: vi.fn().mockRejectedValue(new Error("provider offline")),
      },
      repository,
    );

    const refresh = await service.requestFundamentalsRefresh(
      ticker,
      issuerCnpj,
    );

    await expect(refresh.run?.()).resolves.toBeUndefined();
    expect(repository.failRefresh).toHaveBeenCalledOnce();
  });

  it("contains non-Error provider and persistence rejections", async () => {
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([]),
      getRefresh: vi.fn().mockResolvedValue({
        status: "running",
        retryAfter: null,
        errorCode: null,
      }),
      claimRefresh: vi.fn().mockResolvedValue("lease-token"),
      completeRefresh: vi.fn(),
      failRefresh: vi.fn().mockRejectedValue("database offline"),
    };
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn().mockRejectedValue("provider offline") },
      repository,
    );
    const refresh = await service.requestFundamentalsRefresh(
      ticker,
      issuerCnpj,
    );

    await expect(refresh.run?.()).resolves.toBeUndefined();
  });

  it("marks an empty provider response as a retryable no-data failure", async () => {
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([]),
      getRefresh: vi.fn().mockResolvedValue({
        status: "running",
        retryAfter: null,
        errorCode: null,
      }),
      claimRefresh: vi.fn().mockResolvedValue("lease-token"),
      completeRefresh: vi.fn(),
      failRefresh: vi.fn(),
    };
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn().mockResolvedValue([]) },
      repository,
    );
    const refresh = await service.requestFundamentalsRefresh(
      ticker,
      issuerCnpj,
    );
    await refresh.run?.();

    expect(repository.failRefresh).toHaveBeenCalledWith(
      ticker,
      issuerCnpj,
      expect.stringMatching(/^\d{4}-cvm-v8$/),
      "lease-token",
      "NO_VALID_DATA",
    );
    expect(repository.completeRefresh).not.toHaveBeenCalled();
  });

  it("fails safely when the repository cannot coordinate refresh leases", async () => {
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn() },
    );

    await expect(
      service.requestFundamentalsRefresh(ticker, issuerCnpj),
    ).rejects.toMatchObject({ statusCode: 503 });
    await expect(
      service.requestFundamentalsRefresh("bad", issuerCnpj),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("reads a refresh status only after validating ticker and issuer", async () => {
    const repository = {
      listByTicker: vi.fn(),
      getRefresh: vi.fn().mockResolvedValue({
        status: "completed",
        retryAfter: null,
        errorCode: null,
      }),
    };
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn() },
      repository,
    );

    await expect(
      service.getFundamentalsRefreshState(ticker, issuerCnpj),
    ).resolves.toEqual({
      status: "completed",
      retryAfter: null,
      errorCode: null,
    });
    await expect(
      service.getFundamentalsRefreshState("bad", issuerCnpj),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.getFundamentalsRefreshState(ticker, "bad-cnpj"),
    ).rejects.toMatchObject({ statusCode: 422 });
    await expect(
      service.getFundamentalsRefreshState(ticker, null),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(repository.getRefresh).toHaveBeenCalledOnce();
  });

  it("requires a repository query for scheduled cache refreshes", async () => {
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn() },
    );

    await expect(service.refreshDueFundamentals()).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it("returns an empty result when no cached issuer is due", async () => {
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn() },
      {
        listByTicker: vi.fn(),
        listDueRefreshes: vi.fn().mockResolvedValue([]),
      },
    );

    await expect(service.refreshDueFundamentals()).resolves.toEqual({
      selectedIssuers: 0,
      attemptedIssuers: 0,
      updatedIssuers: 0,
      unavailableIssuers: 0,
      remainingIssuers: 0,
    });
  });

  it("refreshes due cached issuers and reports replacements", async () => {
    const repository = {
      listByTicker: vi.fn(),
      listDueRefreshes: vi
        .fn()
        .mockResolvedValue([{ ticker, cnpj: issuerCnpj }]),
      claimRefresh: vi.fn().mockResolvedValue("scheduled-lease"),
      completeRefresh: vi.fn().mockResolvedValue(true),
      getRefresh: vi.fn().mockResolvedValue({
        status: "completed",
        retryAfter: null,
        errorCode: null,
      }),
    };
    const fundamentalsProvider = {
      getByTicker: vi.fn().mockResolvedValue([reportedPeriod]),
    };
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      fundamentalsProvider,
      repository,
    );

    await expect(
      service.refreshDueFundamentals("weekly-request", 1),
    ).resolves.toEqual({
      selectedIssuers: 1,
      attemptedIssuers: 1,
      updatedIssuers: 1,
      unavailableIssuers: 0,
      remainingIssuers: 1,
    });
    expect(fundamentalsProvider.getByTicker).toHaveBeenCalledWith({
      ticker,
      cnpj: issuerCnpj,
    });
    expect(repository.completeRefresh).toHaveBeenCalledOnce();
  });

  it("reports scheduled provider failures while recording their retry", async () => {
    const repository = {
      listByTicker: vi.fn(),
      listDueRefreshes: vi
        .fn()
        .mockResolvedValue([{ ticker, cnpj: issuerCnpj }]),
      claimRefresh: vi.fn().mockResolvedValue("scheduled-lease"),
      failRefresh: vi.fn().mockResolvedValue(undefined),
      getRefresh: vi.fn().mockResolvedValue({
        status: "failed",
        retryAfter: null,
        errorCode: "PROVIDER_ERROR",
      }),
    };
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn().mockRejectedValue(new Error("source offline")) },
      repository,
    );

    await expect(service.refreshDueFundamentals()).resolves.toMatchObject({
      attemptedIssuers: 1,
      updatedIssuers: 0,
      unavailableIssuers: 1,
    });
    expect(repository.failRefresh).toHaveBeenCalledOnce();
  });

  it("does not count another worker's refresh claim as work", async () => {
    const repository = {
      listByTicker: vi.fn(),
      listDueRefreshes: vi
        .fn()
        .mockResolvedValue([{ ticker, cnpj: issuerCnpj }]),
      claimRefresh: vi.fn().mockResolvedValue(null),
      getRefresh: vi.fn().mockResolvedValue({
        status: "running",
        retryAfter: null,
        errorCode: null,
      }),
    };
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn() },
      repository,
    );

    await expect(service.refreshDueFundamentals()).resolves.toMatchObject({
      selectedIssuers: 1,
      attemptedIssuers: 0,
      updatedIssuers: 0,
      unavailableIssuers: 0,
      remainingIssuers: 0,
    });
  });
});

describe("StockAnalysisService isolated history refresh", () => {
  it("normalizes the ticker and bypasses the provider cache", async () => {
    const historyResult = {
      ticker: "PETR4",
      history: [{ date: "2026-09-30", close: 34.2 }],
      historyStatus: "partial" as const,
      historyFailure: { reason: "timeout" as const },
    };
    const getHistoryByTicker = vi.fn().mockResolvedValue(historyResult);
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
        getHistoryByTicker,
      },
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn() },
    );

    await expect(
      service.getHistoryByTicker(" petr4 ", "history-request"),
    ).resolves.toEqual(historyResult);
    expect(getHistoryByTicker).toHaveBeenCalledWith("PETR4");
  });

  it("rejects invalid tickers before contacting the provider", async () => {
    const getHistoryByTicker = vi.fn();
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
        getHistoryByTicker,
      },
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn() },
    );

    await expect(
      service.getHistoryByTicker("bad ticker"),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(getHistoryByTicker).not.toHaveBeenCalled();
  });

  it("returns an explicit error when the provider does not support history refresh", async () => {
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn() },
    );

    await expect(service.getHistoryByTicker("PETR4")).rejects.toMatchObject({
      statusCode: 501,
    });
  });
});

describe("StockAnalysisService", () => {
  it("does not treat a single-class BRAPI capitalization as issuer valuation evidence", async () => {
    const getValidatedAnalysisQuote = vi.fn().mockResolvedValue(null);
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn().mockResolvedValue({
          ticker: "PETR4",
          companyName: "Petrobras",
          cnpj: "33000167000101",
          price: 30,
          marketCap: 300_000_000,
          changePercent: 1,
          priceUpdatedAt: new Date().toISOString(),
          history: [],
        }),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn().mockResolvedValue([]) },
      { listByTicker: vi.fn().mockResolvedValue([]) },
      {
        getComparisonMetadata: vi.fn().mockResolvedValue([
          {
            ticker: "PETR4",
            cnpj: "33000167000101",
            sector: "Petróleo e Gás",
            subType: "stock",
            issuerMetadataUpdatedAt: new Date(),
          },
        ]),
        getValidatedAnalysisQuote,
      },
    );

    const result = await service.getByTicker("PETR4");

    expect(result.price).toBe(30);
    expect(result.marketCap).toBeNull();
    expect(result.indicators.find(({ key }) => key === "pe")).toMatchObject({
      value: null,
      valuationSource: null,
      valuationMethod: null,
      marketDataDate: null,
      unavailableReason: expect.stringContaining(
        "capitalização total do emissor",
      ),
    });
    expect(getValidatedAnalysisQuote).toHaveBeenCalledWith("PETR4");
  });

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

  it("preserves cached reported annual and interim periods while appending a derived LTM", async () => {
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
      netIncomeAccount: "3.11",
      netIncomeConcept: "consolidated_net_income",
      netIncomeVersion: "1",
      equityAccount: "2.03",
      equityConcept: "consolidated_equity",
      equityVersion: "1",
      revenueAccountLabel: "Receita operacional consolidada",
      revenue: "120",
      netIncome: "24",
      parentNetIncome: "24",
      parentNetIncomeVersion: "1",
      parentNetIncomeAccount: "3.11.01",
      parentNetIncomeConcept: "parent_attributable_net_income",
      equity: "90",
      nonControllingNetIncome: "2",
      nonControllingNetIncomeVersion: "1",
      nonControllingNetIncomeAccount: "3.11.02",
      nonControllingNetIncomeConcept: "non_controlling_net_income",
      nonControllingEquity: "0",
      nonControllingEquityVersion: "1",
      nonControllingEquityAccount: "2.03.09",
      nonControllingEquityConcept: "non_controlling_equity",
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
      revenueVersion: "1",
    };
    const comparativeYtd = {
      ...currentYtd,
      referenceDate: "2025-06-30",
      periodStart: "2025-01-01",
      periodEnd: "2025-06-30",
      exerciseOrder: "previous" as const,
      revenue: "80",
      netIncome: "16",
      parentNetIncome: "16",
      parentNetIncomeVersion: "1",
      parentNetIncomeAccount: "3.11.01",
      parentNetIncomeConcept: "parent_attributable_net_income",
      equity: "70",
      nonControllingNetIncome: "1",
      netIncomeAccount: "3.11",
      netIncomeConcept: "consolidated_net_income",
      equityAccount: "2.03",
      equityConcept: "consolidated_equity",
      revenueAccountLabel: "Receita operacional consolidada",
    };
    const fetchedAt = new Date();
    const repository = {
      listByTicker: vi.fn().mockResolvedValue(
        [annual, currentYtd, comparativeYtd].map((period) => ({
          ...period,
          cnpj: "33000167000101",
          sourceVersion: `${new Date().getUTCFullYear()}-cvm-v8`,
          fetchedAt,
        })),
      ),
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
    expect(result.fundamentals.slice(0, 3)).toEqual(
      expect.arrayContaining([
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
      ]),
    );
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
      equityVersion: "1",
      equityAccount: "2.03",
      equityConcept: "consolidated_equity",
      nonControllingNetIncome: null,
      nonControllingNetIncomeVersion: null,
      nonControllingNetIncomeAccount: null,
      nonControllingNetIncomeConcept: null,
      nonControllingEquity: null,
      nonControllingEquityVersion: null,
      nonControllingEquityAccount: null,
      nonControllingEquityConcept: null,
    });
    expect(result.indicators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "pe",
          value: null,
          referenceDate: null,
          periodBasis: null,
          marketDataDate: null,
          valuationSource: null,
          valuationMethod: null,
          unavailableReason: expect.stringContaining(
            "capitalização total do emissor",
          ),
        }),
        expect.objectContaining({
          key: "pb",
          value: null,
          referenceDate: null,
          periodBasis: null,
          marketDataDate: null,
          valuationSource: null,
          valuationMethod: null,
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

  it("uses the fast analysis quote path when the provider supports it", async () => {
    const marketProvider = {
      getAnalysisByTicker: vi.fn().mockResolvedValue(market),
      getByTicker: vi.fn(),
      getQuoteByTicker: vi.fn(),
      searchTickers: vi.fn(),
    };
    const service = new StockAnalysisService(
      marketProvider,
      { getByTicker: vi.fn().mockResolvedValue([]) },
      { listByTicker: vi.fn().mockResolvedValue([]) },
      {
        getComparisonMetadata: vi.fn().mockResolvedValue([
          {
            ticker: "PETR4",
            cnpj: market.cnpj,
            sector: null,
            subType: "stock",
            issuerMetadataUpdatedAt: new Date("2026-10-20T12:00:00.000Z"),
          },
        ]),
        getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null),
      },
    );

    await expect(service.getByTicker("PETR4")).resolves.toMatchObject({
      ticker: "PETR4",
      history: [],
      cnpj: market.cnpj,
    });
    expect(marketProvider.getAnalysisByTicker).toHaveBeenCalledWith("PETR4");
    expect(marketProvider.getByTicker).not.toHaveBeenCalled();
  });

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
      { listByTicker: vi.fn().mockResolvedValue([]) },
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
      { listByTicker: vi.fn().mockResolvedValue([]) },
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
      "stock_analysis_valuation_quote_lookup_failed",
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
      netIncomeVersion: "1",
      equityAccount: "2.03",
      equityConcept: "consolidated_equity",
      equityVersion: "1",
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
      equityAccount: "2.03",
      equityConcept: "consolidated_equity",
      netIncomeVersion: "1",
      equityVersion: "1",
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

it("explains unavailable ratios when cap evidence or positive equity is missing", () => {
  const period = {
    referenceDate: "2025-12-31",
    periodStart: "2025-01-01",
    periodEnd: "2025-12-31",
    filingReferenceDate: "2026-03-20",
    exerciseOrder: "last" as const,
    periodBasis: "annual" as const,
    periodType: "annual" as const,
    sourceDocument: "DFP" as const,
    netIncomeAccount: "3.11",
    netIncomeConcept: "consolidated_net_income" as const,
    equityAccount: "2.03",
    equityConcept: "consolidated_equity" as const,
    revenue: "100",
    netIncome: "20",
    equity: null,
    assets: null,
    liabilities: null,
    cash: null,
    debt: null,
  };

  const unavailable = calculateAnalysisIndicators([period], {
    marketCap: null,
    marketDataDate: null,
    source: null,
    unavailableReason: null,
  });
  expect(unavailable.find(({ key }) => key === "pe")?.unavailableReason).toBe(
    "Não foi possível validar a capitalização total do emissor para este ticker e data da cotação.",
  );

  const withCapEvidence = calculateAnalysisIndicators(
    [period],
    validatedCapEvidence(200),
  );
  expect(withCapEvidence.find(({ key }) => key === "pb")).toMatchObject({
    value: null,
    unavailableReason:
      "Indisponível: não foi possível reconciliar o patrimônio consolidado com a participação dos sócios não controladores na mesma demonstração.",
  });
});

it("rejects nonpositive controller equity derived from consolidated equity", () => {
  const balance = {
    referenceDate: "2025-12-31",
    periodStart: "2025-01-01",
    periodEnd: "2025-12-31",
    filingReferenceDate: "2026-03-20",
    exerciseOrder: "last" as const,
    periodBasis: "annual" as const,
    periodType: "annual" as const,
    sourceDocument: "DFP" as const,
    equityVersion: "1",
    equityAccount: "2.03",
    equityConcept: "consolidated_equity",
    nonControllingEquityVersion: "1",
    nonControllingEquityAccount: "2.03.09",
    nonControllingEquityConcept: "non_controlling_equity",
    revenue: null,
    netIncome: null,
    parentNetIncome: null,
    assets: null,
    liabilities: null,
    cash: null,
    debt: null,
  };

  for (const [equity, nonControllingEquity] of [
    ["0", "0"],
    ["100", "100"],
  ]) {
    const pb = calculateAnalysisIndicators(
      [
        {
          ...balance,
          equity,
          nonControllingEquity,
        },
      ],
      validatedCapEvidence(200),
    ).find(({ key }) => key === "pb");
    expect(pb).toMatchObject({ value: null, referenceDate: null });
  }
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
    parentNetIncome: null,
    nonControllingNetIncome: null,
    nonControllingEquity: null,
    revenueAccountLabel: "Receita operacional consolidada",
    netIncomeConcept: "consolidated_net_income",
    equityAccount: "2.03",
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
      parentNetIncome: "20",
      parentNetIncomeVersion: "1",
      parentNetIncomeAccount: "3.11.01",
      parentNetIncomeConcept: "parent_attributable_net_income",
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
      parentNetIncome: "12",
      parentNetIncomeVersion: "1",
      parentNetIncomeAccount: "3.11.01",
      parentNetIncomeConcept: "parent_attributable_net_income",
      nonControllingEquity: "0",
      nonControllingEquityVersion: "1",
      nonControllingEquityAccount: "2.03.09",
      nonControllingEquityConcept: "non_controlling_equity",
      revenueVersion: "1",
      netIncomeVersion: "1",
      equityVersion: "1",
      revenueAccountLabel: "Receita operacional consolidada",
      netIncomeAccount: "3.11",
      netIncomeConcept: "consolidated_net_income",
      equityAccount: "2.03",
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
      parentNetIncome: "8",
      parentNetIncomeVersion: "1",
      parentNetIncomeAccount: "3.11.01",
      parentNetIncomeConcept: "parent_attributable_net_income",
      revenueVersion: "1",
      netIncomeVersion: "1",
      equityVersion: "1",
      revenueAccountLabel: "Receita operacional consolidada",
      netIncomeAccount: "3.11",
      netIncomeConcept: "consolidated_net_income",
      equityAccount: "2.03",
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

  const indicators = calculateAnalysisIndicators(
    periods,
    validatedCapEvidence(240),
  );
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

  const parentOnlyFlows = calculateAnalysisIndicators(
    periods.map((period) => ({ ...period, netIncome: null })),
    validatedCapEvidence(240),
  );
  expect(parentOnlyFlows.find(({ key }) => key === "pe")).toMatchObject({
    value: 10,
  });
  expect(parentOnlyFlows.find(({ key }) => key === "netMargin")).toMatchObject({
    value: null,
  });

  const missingConsolidatedConcept = periods.map((period) =>
    period.periodBasis === "year_to_date"
      ? { ...period, netIncomeConcept: null }
      : period,
  );
  expect(
    calculateAnalysisIndicators(
      missingConsolidatedConcept,
      validatedCapEvidence(240),
    ).find(({ key }) => key === "netMargin"),
  ).toMatchObject({ value: null });

  const balancesWithoutPeriodEnd = periods.map((period) =>
    period.exerciseOrder === "previous"
      ? period
      : { ...period, periodEnd: undefined },
  );
  expect(
    calculateAnalysisIndicators(
      balancesWithoutPeriodEnd,
      validatedCapEvidence(240),
    ).find(({ key }) => key === "pb"),
  ).toMatchObject({
    value: 240 / 90,
    referenceDate: "2026-06-30",
  });

  const incompatibleConsolidatedIncome = periods.map((period) =>
    period.periodBasis === "year_to_date"
      ? { ...period, netIncomeAccount: "3.12" }
      : period,
  );
  expect(
    calculateAnalysisIndicators(
      incompatibleConsolidatedIncome,
      validatedCapEvidence(240),
    ).find(({ key }) => key === "netMargin"),
  ).toMatchObject({ value: null });

  const latestAnnualWithoutParent = {
    ...periods[0]!,
    parentNetIncome: null,
    parentNetIncomeVersion: null,
    parentNetIncomeAccount: null,
    parentNetIncomeConcept: null,
  };
  const olderAnnualWithParent = {
    ...periods[0]!,
    referenceDate: "2024-12-31",
    periodStart: "2024-01-01",
    periodEnd: "2024-12-31",
    filingReferenceDate: "2025-03-20",
  };
  expect(
    calculateAnalysisIndicators(
      [latestAnnualWithoutParent, olderAnnualWithParent],
      validatedCapEvidence(240),
    ).find(({ key }) => key === "pe"),
  ).toMatchObject({
    value: null,
    unavailableReason: expect.stringContaining(
      "demonstrações financeiras mais recentes",
    ),
  });

  const unverifiedCurrentBalance = {
    ...periods[1]!,
    sourceDocument: undefined,
    periodEnd: undefined,
    exerciseOrder: undefined,
  } as unknown as (typeof periods)[number];
  expect(
    calculateAnalysisIndicators(
      [...periods, unverifiedCurrentBalance],
      validatedCapEvidence(240),
    ).find(({ key }) => key === "roe"),
  ).toMatchObject({ value: null });

  const mismatchedLtmIncomeAccount = periods.map((period) =>
    period.exerciseOrder === "previous"
      ? { ...period, parentNetIncomeAccount: "3.12" }
      : period.periodBasis === "year_to_date"
        ? { ...period, parentNetIncomeAccount: "3.12" }
        : period,
  );
  expect(
    calculateAnalysisIndicators(
      mismatchedLtmIncomeAccount,
      validatedCapEvidence(240),
    ).find(({ key }) => key === "pe"),
  ).toMatchObject({
    value: 12,
    referenceDate: "2025-12-31",
    periodBasis: "annual",
  });
  expect(
    calculateAnalysisIndicators(
      mismatchedLtmIncomeAccount,
      validatedCapEvidence(240),
    ).find(({ key }) => key === "roe"),
  ).toMatchObject({ value: 30 });

  const duplicateAnnual = [
    ...periods,
    { ...periods[0]!, exerciseOrder: "previous" as const },
  ];
  expect(
    calculateAnalysisIndicators(
      duplicateAnnual,
      validatedCapEvidence(240),
    ).find(({ key }) => key === "roe"),
  ).toMatchObject({ value: 30 });

  const mismatchedOpeningAccount = periods.map((period) =>
    period.exerciseOrder === "previous"
      ? { ...period, equityAccount: "2.08" }
      : period,
  );
  expect(
    calculateAnalysisIndicators(
      mismatchedOpeningAccount,
      validatedCapEvidence(240),
    ).find(({ key }) => key === "roe"),
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
    calculateAnalysisIndicators(
      [...periods, legacyDuplicateOpening],
      validatedCapEvidence(240),
    ).find(({ key }) => key === "roe"),
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
    calculateAnalysisIndicators(
      [...periods, duplicateEndingBalance],
      validatedCapEvidence(240),
    ).find(({ key }) => key === "roe"),
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
      validatedCapEvidence(240),
    ).find(({ key }) => key === "roe"),
  ).toMatchObject({ value: 30 });

  const conflictingSameCutoffBalance = {
    ...sameBalanceReportedAsQuarterly,
    equity: "91",
  };
  expect(
    calculateAnalysisIndicators(
      [...periods, conflictingSameCutoffBalance],
      validatedCapEvidence(240),
    ).find(({ key }) => key === "roe"),
  ).toMatchObject({
    value: null,
    unavailableReason: expect.stringContaining("lucro LTM encerrado em"),
  });

  const mismatchedIncomeConcept = periods.map((period) =>
    period.sourceDocument === "DFP"
      ? { ...period, parentNetIncomeConcept: "other_income_concept" }
      : period,
  );
  expect(
    calculateAnalysisIndicators(
      mismatchedIncomeConcept,
      validatedCapEvidence(240),
    ).find(({ key }) => key === "pe"),
  ).toMatchObject({
    value: null,
    referenceDate: null,
    periodBasis: null,
  });

  const mismatchedInterimAccount = periods.map((period) =>
    period.exerciseOrder === "previous"
      ? { ...period, parentNetIncomeAccount: "3.11.02" }
      : period,
  );
  expect(
    calculateAnalysisIndicators(
      mismatchedInterimAccount,
      validatedCapEvidence(240),
    ).find(({ key }) => key === "pe"),
  ).toMatchObject({
    value: 12,
    referenceDate: "2025-12-31",
    periodBasis: "annual",
  });

  const missingIncomeConcept = periods.map((period) =>
    period.exerciseOrder === "last" && period.sourceDocument === "ITR"
      ? { ...period, parentNetIncomeConcept: null }
      : period,
  );
  expect(
    calculateAnalysisIndicators(
      missingIncomeConcept,
      validatedCapEvidence(240),
    ).find(({ key }) => key === "pe"),
  ).toMatchObject({
    value: 12,
    referenceDate: "2025-12-31",
    periodBasis: "annual",
  });

  const missingAnnualIncomeAccount = periods.map((period) =>
    period.sourceDocument === "DFP"
      ? { ...period, parentNetIncomeAccount: null }
      : period,
  );
  expect(
    calculateAnalysisIndicators(
      missingAnnualIncomeAccount,
      validatedCapEvidence(240),
    ).find(({ key }) => key === "pe"),
  ).toMatchObject({
    value: null,
    unavailableReason: expect.stringContaining("atribuível à controladora"),
  });

  expect(
    calculateAnalysisIndicators(
      periods.map((period) => ({
        ...period,
        revenue: "invalid amount",
        netIncome: "invalid amount",
        parentNetIncome: "invalid amount",
      })),
      validatedCapEvidence(240),
    ).find(({ key }) => key === "pe"),
  ).toMatchObject({
    value: null,
    referenceDate: null,
    periodBasis: null,
    unavailableReason: expect.stringContaining(
      "lucro positivo atribuível à controladora",
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
      netIncomeAccount: "3.11",
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
      netIncomeAccount: "3.11",
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
      netIncomeAccount: "3.11",
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
    calculateAnalysisIndicators(
      [...periods, quarterlyBalance],
      validatedCapEvidence(240),
    ).find(({ key }) => key === "roe"),
  ).toMatchObject({
    value: expect.closeTo(21.48, 2),
    referenceDate: "2026-06-30",
    periodBasis: "trailing_twelve_months",
  });
  expect(
    calculateAnalysisIndicators(
      [...periods, { ...quarterlyBalance, equity: "228027000" }],
      validatedCapEvidence(240),
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
      netIncomeAccount: "3.11",
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
      netIncomeAccount: "3.11",
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
      netIncomeAccount: "3.11",
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
        equityAccount: "2.03",
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
    parentNetIncome: null,
    parentNetIncomeVersion: null,
    parentNetIncomeAccount: null,
    parentNetIncomeConcept: null,
    nonControllingNetIncome: null,
    nonControllingNetIncomeVersion: null,
    nonControllingNetIncomeAccount: null,
    nonControllingNetIncomeConcept: null,
    equityVersion: "1",
    equityAccount: "2.03",
    equityConcept: "consolidated_equity",
    nonControllingEquity: null,
    nonControllingEquityVersion: null,
    nonControllingEquityAccount: null,
    nonControllingEquityConcept: null,
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
        nonControllingEquity: "0",
        nonControllingEquityVersion: "1",
        nonControllingEquityAccount: "2.03.09",
        nonControllingEquityConcept: "non_controlling_equity",
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
    validatedCapEvidence(1000),
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
      parentNetIncome: "20",
      parentNetIncomeVersion: "1",
      parentNetIncomeAccount: "3.11.01",
      parentNetIncomeConcept: "parent_attributable_net_income",
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
      parentNetIncome: "12",
      parentNetIncomeVersion: "1",
      parentNetIncomeAccount: "3.11.01",
      parentNetIncomeConcept: "parent_attributable_net_income",
      equity: "90",
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
      parentNetIncome: "8",
      parentNetIncomeVersion: "1",
      parentNetIncomeAccount: "3.11.01",
      parentNetIncomeConcept: "parent_attributable_net_income",
      equity: "70",
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
    },
  ];

  const indicators = calculateAnalysisIndicators(
    periods,
    validatedCapEvidence(240),
  );
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
    parentNetIncomeVersion: "1",
    parentNetIncomeAccount: "3.11.01",
    parentNetIncomeConcept: "parent_attributable_net_income",
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
      parentNetIncome: "20",
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
      parentNetIncome: "12",
      revenueVersion: "1",
      netIncomeVersion: "1",
      netIncomeAccount: "3.11",
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
      parentNetIncome: "8",
      revenueVersion: "1",
      netIncomeVersion: "1",
      netIncomeAccount: "3.11",
      netIncomeConcept: "consolidated_net_income",
    },
  ];

  const indicators = calculateAnalysisIndicators(
    periods,
    validatedCapEvidence(240),
  );
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
    validatedCapEvidence(200),
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
    parentNetIncomeVersion: "1",
    parentNetIncomeAccount: "3.11.01",
    parentNetIncomeConcept: "parent_attributable_net_income",
    parentNetIncome: "20",
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
        parentNetIncome: "12",
        parentNetIncomeVersion: "2",
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
        parentNetIncome: "8",
        revenueVersion: "1",
        netIncomeVersion: "1",
      },
    ],
    validatedCapEvidence(240),
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
      parentNetIncome: "0",
      parentNetIncomeVersion: "1",
      parentNetIncomeAccount: "3.11.01",
      parentNetIncomeConcept: "parent_attributable_net_income",
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
      parentNetIncome: "-5",
      parentNetIncomeVersion: "1",
      parentNetIncomeAccount: "3.11.01",
      parentNetIncomeConcept: "parent_attributable_net_income",
      equity: "90",
      revenueVersion: "1",
      netIncomeVersion: "1",
      equityVersion: "2",
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
      parentNetIncome: "-3",
      parentNetIncomeVersion: "1",
      parentNetIncomeAccount: "3.11.01",
      parentNetIncomeConcept: "parent_attributable_net_income",
      equity: "80",
      revenueVersion: "1",
      netIncomeVersion: "1",
      equityVersion: "1",
      netIncomeAccount: "3.11",
      netIncomeConcept: "consolidated_net_income",
      equityAccount: "2.07",
      equityConcept: "consolidated_equity",
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
    },
  ];

  const indicators = calculateAnalysisIndicators(
    periods,
    validatedCapEvidence(240),
  );
  expect(indicators.find(({ key }) => key === "pe")?.unavailableReason).toBe(
    "Indisponível: o lucro atribuível à controladora não está disponível no LTM encerrado em 2026-06-30.",
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
        filingReferenceDate: "2026-03-20",
        isDerived: false,
        netIncomeAccount: "3.11",
        netIncomeConcept: "consolidated_net_income",
        equityAccount: "2.03",
        equityConcept: "consolidated_equity",
        revenue: "100",
        netIncome: "20",
        equity: "80",
        parentNetIncome: "20",
        parentNetIncomeVersion: "1",
        parentNetIncomeAccount: "3.11.01",
        parentNetIncomeConcept: "parent_attributable_net_income",
        nonControllingEquity: "10",
        nonControllingEquityVersion: "1",
        nonControllingEquityAccount: "2.03.09",
        nonControllingEquityConcept: "non_controlling_equity",
        equityVersion: "1",
        assets: null,
        liabilities: null,
        cash: null,
        debt: null,
      },
    ],
    validatedCapEvidence(400),
  );

  expect(indicators).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ key: "pe", value: 20, sourceDocument: "DFP" }),
      expect.objectContaining({
        key: "pb",
        value: 400 / 70,
        sourceDocument: "DFP",
      }),
      expect.objectContaining({
        key: "roe",
        value: null,
        unavailableReason:
          "Indisponível: são necessárias demonstrações financeiras anuais de dois anos consecutivos, com lucro líquido e patrimônio líquido informados.",
      }),
    ]),
  );
});

it("does not treat CVM earnings per share account 3.13 as net income for P/L", () => {
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
        netIncomeAccount: "3.13",
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
    validatedCapEvidence(400),
  );

  expect(indicators.find(({ key }) => key === "pe")).toMatchObject({
    value: null,
    unavailableReason: expect.stringContaining("atribuível à controladora"),
  });
});

it("does not calculate P/VP from legacy balances without provenance and minority equity", () => {
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
    validatedCapEvidence(200),
  );

  expect(indicators.find(({ key }) => key === "pb")).toMatchObject({
    value: null,
    referenceDate: null,
    unavailableReason: expect.stringContaining("não foi possível reconciliar"),
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
    equityAccount: "2.03",
    equityConcept: "consolidated_equity",
    nonControllingEquity: "10",
    nonControllingEquityVersion: "2",
    nonControllingEquityAccount: "2.03.09",
    nonControllingEquityConcept: "non_controlling_equity",
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
    calculateAnalysisIndicators(
      [balance, quarterlyEquivalent],
      validatedCapEvidence(200),
    ).find(({ key }) => key === "pb"),
  ).toMatchObject({
    value: 200 / 90,
    referenceDate: "2025-06-30",
  });
  expect(
    calculateAnalysisIndicators(
      [balance, { ...quarterlyEquivalent, equity: "110" }],
      validatedCapEvidence(200),
    ).find(({ key }) => key === "pb"),
  ).toMatchObject({
    value: null,
    referenceDate: null,
    unavailableReason: expect.stringContaining("não foi possível reconciliar"),
  });

  const newerIncompatibleBalance = {
    ...balance,
    referenceDate: "2025-09-30",
    periodEnd: "2025-09-30",
    nonControllingEquity: null,
  };
  expect(
    calculateAnalysisIndicators(
      [balance, newerIncompatibleBalance],
      validatedCapEvidence(200),
    ).find(({ key }) => key === "pb"),
  ).toMatchObject({ value: null, referenceDate: null });
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
    netIncomeAccount: "3.11",
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

  it("accepts absent BRAPI CNPJ but rejects one that conflicts with active CVM metadata", async () => {
    const quote = {
      ticker: "PETR4",
      cnpj: null,
      companyName: "Petrobras",
      price: 30,
      marketCap: 300,
      observedAt: new Date("2026-09-19T15:30:00Z"),
    };
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn().mockResolvedValue(quote),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn() },
      {
        getValidatedAnalysisQuote: vi.fn(),
        getComparisonMetadata: vi
          .fn()
          .mockResolvedValue([{ ticker: "PETR4", cnpj: "33.000.167/0001-01" }]),
      } as never,
    );

    const result = await service.getMarketByTicker("PETR4");
    expect(result.cnpj).toBe("33000167000101");

    const mismatchedService = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi
          .fn()
          .mockResolvedValue({ ...quote, cnpj: "99000167000101" }),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn() },
      {
        getValidatedAnalysisQuote: vi.fn(),
        getComparisonMetadata: vi
          .fn()
          .mockResolvedValue([{ ticker: "PETR4", cnpj: "33000167000101" }]),
      } as never,
    );
    await expect(
      mismatchedService.getMarketByTicker("PETR4"),
    ).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it.each([
    {
      ticker: "CMIG4",
      cnpj: "17155730000164",
      companyName: "Cemig",
      marketCap: 25_000_000_000,
    },
    {
      ticker: "ITUB4",
      cnpj: "60872504000123",
      companyName: "Itaú Unibanco",
      marketCap: 300_000_000_000,
    },
  ])(
    "calculates issuer ratios from validated $ticker quote and CVM data",
    async (company) => {
      const quoteObservedAt = new Date();
      const cached = expiredCachePeriod({
        cnpj: company.cnpj,
        netIncome: "5000000000",
        parentNetIncome: "5000000000",
        parentNetIncomeVersion: "1",
        parentNetIncomeAccount: "3.11.01",
        parentNetIncomeConcept: "parent_attributable_net_income",
        equity: "30000000000",
        nonControllingEquity: "10000000000",
        nonControllingEquityVersion: "1",
        nonControllingEquityAccount: "2.03.09",
        nonControllingEquityConcept: "non_controlling_equity",
      });
      const market = {
        ticker: company.ticker,
        cnpj: company.cnpj,
        companyName: company.companyName,
        price: 20,
        marketCap: company.marketCap,
        changePercent: 1,
        priceUpdatedAt: quoteObservedAt.toISOString(),
        history: [],
      };
      const service = new StockAnalysisService(
        {
          getAnalysisByTicker: vi.fn().mockResolvedValue(market),
          getByTicker: vi.fn(),
          getQuoteByTicker: vi.fn(),
          searchTickers: vi.fn(),
        },
        { getByTicker: vi.fn() },
        { listByTicker: vi.fn().mockResolvedValue([cached]) },
        {
          getComparisonMetadata: vi.fn().mockResolvedValue([
            {
              ticker: company.ticker,
              cnpj: company.cnpj,
              sector: "Setor de teste",
              subType: "stock",
              issuerMetadataUpdatedAt: quoteObservedAt,
            },
          ]),
          getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null),
        },
      );

      const result = await service.getByTicker(company.ticker);

      expect(result).toMatchObject({
        marketCap: null,
        marketCapIdentityVerified: false,
      });
      expect(
        result.indicators.find(({ key }) => key === "pe")?.value,
      ).toBeNull();
      expect(
        result.indicators.find(({ key }) => key === "pb")?.value,
      ).toBeNull();
    },
  );

  it("uses validated screener capitalization when the fresh provider quote omits it", async () => {
    const observedAt = new Date();
    const cnpj = "17155730000164";
    const cached = expiredCachePeriod({
      cnpj,
      fetchedAt: new Date(),
      sourceVersion: `${new Date().getUTCFullYear()}-cvm-v8`,
      netIncome: "5000000000",
      parentNetIncome: "5000000000",
      parentNetIncomeVersion: "1",
      parentNetIncomeAccount: "3.11.01",
      parentNetIncomeConcept: "parent_attributable_net_income",
      equity: "30000000000",
      nonControllingEquity: "10000000000",
      nonControllingEquityVersion: "1",
      nonControllingEquityAccount: "2.03.09",
      nonControllingEquityConcept: "non_controlling_equity",
    });
    const marketProvider = {
      getAnalysisByTicker: vi.fn().mockResolvedValue({
        ticker: "CMIG4",
        cnpj,
        companyName: "Cemig",
        price: 20,
        marketCap: null,
        changePercent: 1,
        priceUpdatedAt: observedAt.toISOString(),
        history: [],
      }),
      getByTicker: vi.fn(),
      getQuoteByTicker: vi.fn(),
      searchTickers: vi.fn(),
    };
    const screener = {
      getComparisonMetadata: vi
        .fn()
        .mockResolvedValue([{ ticker: "CMIG4", cnpj, subType: "stock" }]),
      getValidatedAnalysisQuote: vi.fn().mockResolvedValue({
        ticker: "CMIG4",
        returnedTicker: "CMIG4",
        issuerCnpj: cnpj,
        price: "20",
        marketCap: "300000000000",
        quoteObservedAt: observedAt,
        snapshotMarketCap: "300000000000",
        snapshotObservedAt: observedAt,
        snapshotQuoteObservedAt: observedAt,
      }),
    };
    const service = new StockAnalysisService(
      marketProvider,
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn().mockResolvedValue([cached]) },
      screener,
    );

    const result = await service.getByTicker("CMIG4");

    expect(screener.getValidatedAnalysisQuote).toHaveBeenCalledWith("CMIG4");
    expect(result).toMatchObject({
      price: 20,
      marketCap: 300_000_000_000,
      marketCapIdentityVerified: true,
    });
    expect(result.indicators.find(({ key }) => key === "pe")).toMatchObject({
      value: 60,
      valuationSource: "ScreenerRepository.getValidatedAnalysisQuote",
    });
  });

  it.each([
    {
      description: "missing market capitalization",
      overrides: { marketCap: null },
    },
    {
      description: "stale quote observation",
      overrides: {
        priceUpdatedAt: new Date(
          Date.now() - 8 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      },
    },
    {
      description: "future quote observation",
      overrides: {
        priceUpdatedAt: new Date(Date.now() + 60_000).toISOString(),
      },
    },
    {
      description: "nonpositive market capitalization",
      overrides: { marketCap: 0 },
    },
  ])("keeps valuation unavailable with $description", async ({ overrides }) => {
    const quoteObservedAt = new Date();
    const cnpj = "17155730000164";
    const cached = expiredCachePeriod({ cnpj });
    const market = {
      ticker: "CMIG4",
      cnpj,
      companyName: "Cemig",
      price: 20,
      marketCap: 25_000_000_000,
      changePercent: 1,
      priceUpdatedAt: quoteObservedAt.toISOString(),
      history: [],
      ...overrides,
    };
    const service = new StockAnalysisService(
      {
        getAnalysisByTicker: vi.fn().mockResolvedValue(market),
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn().mockResolvedValue([cached]) },
      {
        getComparisonMetadata: vi
          .fn()
          .mockResolvedValue([{ ticker: "CMIG4", cnpj, subType: "stock" }]),
        getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null),
      },
    );

    const result = await service.getByTicker("CMIG4");

    expect(result.marketCapIdentityVerified).toBe(false);
    expect(result.indicators.find(({ key }) => key === "pe")?.value).toBeNull();
    expect(result.indicators.find(({ key }) => key === "pb")?.value).toBeNull();
  });

  it("rejects a ticker quote whose CNPJ conflicts with the CVM link", async () => {
    const cnpj = "17155730000164";
    const service = new StockAnalysisService(
      {
        getAnalysisByTicker: vi.fn().mockResolvedValue({
          ticker: "CMIG4",
          cnpj: "33000167000101",
          companyName: "Cemig",
          price: 20,
          marketCap: 25_000_000_000,
          changePercent: 1,
          priceUpdatedAt: new Date().toISOString(),
          history: [],
        }),
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn().mockResolvedValue([]) },
      {
        getComparisonMetadata: vi
          .fn()
          .mockResolvedValue([{ ticker: "CMIG4", cnpj, subType: "stock" }]),
        getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null),
      },
    );

    await expect(service.getByTicker("CMIG4")).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it("does not treat provider CNPJ as a CVM ticker link when the link is absent", async () => {
    const cnpj = "17155730000164";
    const cached = expiredCachePeriod({
      cnpj,
      netIncome: "5000000000",
      equity: "30000000000",
    });
    const service = new StockAnalysisService(
      {
        getAnalysisByTicker: vi.fn().mockResolvedValue({
          ticker: "CMIG4",
          cnpj,
          companyName: "Cemig",
          price: 20,
          marketCap: 25_000_000_000,
          changePercent: 1,
          priceUpdatedAt: new Date().toISOString(),
          history: [],
        }),
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn().mockResolvedValue([cached]) },
      {
        getComparisonMetadata: vi.fn().mockResolvedValue([]),
        getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null),
      },
    );

    const result = await service.getByTicker("CMIG4");

    expect(result.marketCapIdentityVerified).toBe(false);
    expect(result.indicators.find(({ key }) => key === "pe")?.value).toBeNull();
    expect(result.indicators.find(({ key }) => key === "pb")?.value).toBeNull();
  });

  it("fails closed for invalid or ambiguous market-stage issuer metadata", async () => {
    const quote = {
      ticker: "PETR4",
      cnpj: null,
      companyName: "Petrobras",
      price: 30,
      marketCap: 300,
    };
    const createService = (metadata: Array<{ ticker: string; cnpj: string }>) =>
      new StockAnalysisService(
        {
          getByTicker: vi.fn(),
          getQuoteByTicker: vi.fn().mockResolvedValue(quote),
          searchTickers: vi.fn(),
        },
        { getByTicker: vi.fn() },
        { listByTicker: vi.fn() },
        {
          getValidatedAnalysisQuote: vi.fn(),
          getComparisonMetadata: vi.fn().mockResolvedValue(metadata),
        } as never,
      );

    await expect(
      createService([]).getMarketByTicker("invalid"),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      createService([
        { ticker: "PETR4", cnpj: "33000167000101" },
        { ticker: "PETR4", cnpj: "33000167000102" },
      ]).getMarketByTicker("PETR4"),
    ).rejects.toMatchObject({ statusCode: 422 });
    await expect(
      createService([
        { ticker: "VALE3", cnpj: "33000167000101" },
      ]).getMarketByTicker("PETR4"),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("supports a market lookup without optional screener metadata enrichment", async () => {
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn().mockResolvedValue({
          ticker: "PETR4",
          cnpj: null,
          companyName: "Petrobras",
          price: 30,
          marketCap: 300,
        }),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn() },
      { getValidatedAnalysisQuote: vi.fn() },
    );
    await expect(service.getMarketByTicker("PETR4")).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it("returns a verified quote without a provider observation timestamp", async () => {
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn().mockResolvedValue({
          ticker: "PETR4",
          cnpj: null,
          companyName: "Petrobras",
          price: 30,
          marketCap: 300,
        }),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn() },
      {
        getComparisonMetadata: vi
          .fn()
          .mockResolvedValue([{ ticker: "PETR4", cnpj: "33000167000101" }]),
      } as never,
    );
    await expect(service.getMarketByTicker("PETR4")).resolves.toMatchObject({
      ticker: "PETR4",
      cnpj: "33000167000101",
      marketCap: null,
      priceUpdatedAt: null,
    });
  });

  it("falls back to validated stale CVM cache when an issuer refresh fails", async () => {
    const stale = expiredCachePeriod();
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn().mockRejectedValue(new Error("CVM timeout")) },
      {
        listByTicker: vi.fn().mockResolvedValue([stale]),
      },
      { getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null) },
    );

    const result = await service.getFundamentalsByIssuer(
      "PETR4",
      "33000167000101",
    );

    expect(result.fundamentalsIsStale).toBe(true);
    expect(result.fundamentalsFetchedAt).toBe(stale.fetchedAt.toISOString());
    expect(result.fundamentals[0]?.netIncome).toBe("10");
  });

  it("uses validated stale CVM cache when a successful refresh returns no periods", async () => {
    const stale = expiredCachePeriod();
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn().mockResolvedValue([]) },
      { listByTicker: vi.fn().mockResolvedValue([stale]) },
      { getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null) },
    );
    const result = await service.getFundamentalsByIssuer(
      "PETR4",
      "33000167000101",
    );
    expect(result.fundamentalsIsStale).toBe(true);
    expect(result.fundamentalsFetchedAt).toBe(stale.fetchedAt.toISOString());
  });

  it("uses an exact recent screener quote for individual fundamentals valuation", async () => {
    const observedAt = new Date();
    const cached = expiredCachePeriod({
      fetchedAt: new Date(),
      sourceVersion: `${new Date().getUTCFullYear()}-cvm-v8`,
      parentNetIncome: "10",
      parentNetIncomeVersion: "1",
      parentNetIncomeAccount: "3.11.01",
      parentNetIncomeConcept: "parent_attributable_net_income",
      nonControllingEquity: "0",
      nonControllingEquityVersion: "1",
      nonControllingEquityAccount: "2.03.09",
      nonControllingEquityConcept: "non_controlling_equity",
    });
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn().mockResolvedValue([cached]) },
      {
        getValidatedAnalysisQuote: vi.fn().mockResolvedValue({
          ticker: "PETR4",
          returnedTicker: "PETR4",
          issuerCnpj: "33000167000101",
          companyName: "Petrobras",
          price: "30",
          marketCap: "300",
          quoteObservedAt: observedAt,
          snapshotMarketCap: "300",
          snapshotObservedAt: observedAt,
          snapshotQuoteObservedAt: observedAt,
        }),
      },
    );

    const result = await service.getFundamentalsByIssuer(
      "PETR4",
      "33000167000101",
    );

    expect(result).toMatchObject({
      marketDataIdentityVerified: true,
      marketCapIdentityVerified: true,
      price: 30,
      marketCap: 300,
      priceUpdatedAt: observedAt.toISOString(),
    });
    expect(service["marketProvider"].getQuoteByTicker).not.toHaveBeenCalled();
    expect(result.indicators.find(({ key }) => key === "pe")).toMatchObject({
      value: 30,
      valuationSource: "ScreenerRepository.getValidatedAnalysisQuote",
      valuationMethod: "market_cap_emissor / lucro_atribuido_controladora_cvm",
      marketDataDate: observedAt.toISOString(),
    });
  });

  it("uses the validated provider quote and issuer capitalization", async () => {
    const observedAt = new Date();
    const cached = expiredCachePeriod({
      fetchedAt: new Date(),
      sourceVersion: `${new Date().getUTCFullYear()}-cvm-v8`,
      parentNetIncome: "10",
      parentNetIncomeVersion: "1",
      parentNetIncomeAccount: "3.11.01",
      parentNetIncomeConcept: "parent_attributable_net_income",
      nonControllingEquity: "0",
      nonControllingEquityVersion: "1",
      nonControllingEquityAccount: "2.03.09",
      nonControllingEquityConcept: "non_controlling_equity",
    });
    const marketProvider = {
      getByTicker: vi.fn(),
      getQuoteByTicker: vi.fn().mockResolvedValue({
        ticker: "PETR4",
        cnpj: "33.000.167/0001-01",
        companyName: "Petrobras",
        price: 30,
        marketCap: 300,
        observedAt,
      }),
      searchTickers: vi.fn(),
    };
    const service = new StockAnalysisService(
      marketProvider,
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn().mockResolvedValue([cached]) },
      { getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null) },
    );

    const result = await service.getFundamentalsByIssuer(
      "PETR4",
      "33000167000101",
    );

    expect(marketProvider.getQuoteByTicker).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      marketDataIdentityVerified: true,
      marketCapIdentityVerified: false,
      price: 30,
      marketCap: null,
      priceUpdatedAt: observedAt.toISOString(),
    });
    expect(result.indicators.find(({ key }) => key === "pe")?.value).toBeNull();
    expect(result.indicators.find(({ key }) => key === "pb")?.value).toBeNull();
  });

  it("falls back to a valid provider quote when the screener evidence is invalid", async () => {
    const observedAt = new Date();
    const cached = expiredCachePeriod({
      fetchedAt: new Date(),
      sourceVersion: `${new Date().getUTCFullYear()}-cvm-v8`,
    });
    const marketProvider = {
      getByTicker: vi.fn(),
      getQuoteByTicker: vi.fn().mockResolvedValue({
        ticker: "PETR4",
        cnpj: null,
        companyName: "Petrobras",
        price: 30,
        marketCap: 300,
        observedAt,
      }),
      searchTickers: vi.fn(),
    };
    const service = new StockAnalysisService(
      marketProvider,
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn().mockResolvedValue([cached]) },
      {
        getValidatedAnalysisQuote: vi.fn().mockResolvedValue({
          ticker: "PETR4",
          returnedTicker: "VALE3",
          issuerCnpj: "33000167000101",
          price: "30",
          marketCap: "300",
          quoteObservedAt: observedAt,
          snapshotMarketCap: "300",
          snapshotObservedAt: observedAt,
          snapshotQuoteObservedAt: observedAt,
        }),
      },
    );

    const result = await service.getFundamentalsByIssuer(
      "PETR4",
      "33000167000101",
    );

    expect(marketProvider.getQuoteByTicker).toHaveBeenCalledOnce();
    expect(result.marketDataIdentityVerified).toBe(true);
    expect(result.price).toBe(30);
  });

  it("accepts a case-normalized price without BRAPI market capitalization", async () => {
    const observedAt = new Date(Date.now() - 60 * 60 * 1000);
    const cached = expiredCachePeriod({
      fetchedAt: new Date(),
      sourceVersion: `${new Date().getUTCFullYear()}-cvm-v8`,
    });
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn().mockResolvedValue({
          ticker: "petr4",
          cnpj: null,
          companyName: "Petrobras",
          price: 30,
          marketCap: null,
          observedAt,
        }),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn().mockResolvedValue([cached]) },
      { getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null) },
    );

    const result = await service.getFundamentalsByIssuer(
      "PETR4",
      "33000167000101",
    );

    expect(result).toMatchObject({
      marketDataIdentityVerified: true,
      price: 30,
      marketCap: null,
      priceUpdatedAt: observedAt.toISOString(),
    });
    expect(result.indicators.find(({ key }) => key === "pe")?.value).toBeNull();
    expect(result.indicators.find(({ key }) => key === "pb")?.value).toBeNull();
  });

  it("keeps current fundamentals available when the fallback quote request fails", async () => {
    const cached = expiredCachePeriod({
      fetchedAt: new Date(),
      sourceVersion: `${new Date().getUTCFullYear()}-cvm-v8`,
    });
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn().mockRejectedValue(new Error("BRAPI offline")),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn().mockResolvedValue([cached]) },
      { getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null) },
    );

    const result = await service.getFundamentalsByIssuer(
      "PETR4",
      "33000167000101",
    );

    expect(result.marketDataIdentityVerified).toBe(false);
    expect(result.price).toBeNull();
    expect(result.fundamentals).toHaveLength(1);
  });

  it.each([
    ["ticker", { ticker: "VALE3" }],
    ["CNPJ", { cnpj: "99000167000101" }],
    ["non-positive price", { price: 0 }],
    ["non-finite price", { price: Number.NaN }],
    ["missing timestamp", { observedAt: null }],
    ["invalid timestamp", { observedAt: new Date(Number.NaN) }],
    ["stale timestamp", { observedAt: new Date(Date.now() - 8 * 86_400_000) }],
    ["future timestamp", { observedAt: new Date(Date.now() + 60_000) }],
  ])(
    "rejects fallback provider quotes with invalid %s",
    async (_label, fields) => {
      const cached = expiredCachePeriod({
        fetchedAt: new Date(),
        sourceVersion: `${new Date().getUTCFullYear()}-cvm-v8`,
      });
      const service = new StockAnalysisService(
        {
          getByTicker: vi.fn(),
          getQuoteByTicker: vi.fn().mockResolvedValue({
            ticker: "PETR4",
            cnpj: null,
            companyName: "Petrobras",
            price: 30,
            marketCap: 300,
            observedAt: new Date(),
            ...fields,
          }),
          searchTickers: vi.fn(),
        },
        { getByTicker: vi.fn() },
        { listByTicker: vi.fn().mockResolvedValue([cached]) },
        { getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null) },
      );

      const result = await service.getFundamentalsByIssuer(
        "PETR4",
        "33000167000101",
      );

      expect(result.marketDataIdentityVerified).toBe(false);
      expect(result.price).toBeNull();
      expect(result.marketCap).toBeNull();
      expect(
        result.indicators.find(({ key }) => key === "pe")?.value,
      ).toBeNull();
      expect(
        result.indicators.find(({ key }) => key === "pb")?.value,
      ).toBeNull();
    },
  );

  it("loads cached fundamentals when the optional quote repository method is absent", async () => {
    const cached = expiredCachePeriod({
      fetchedAt: new Date(),
      sourceVersion: `${new Date().getUTCFullYear()}-cvm-v8`,
    });
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn().mockResolvedValue([cached]) },
      {} as never,
    );

    const result = await service.getFundamentalsByIssuer(
      "PETR4",
      "33000167000101",
    );

    expect(result.marketDataIdentityVerified).toBe(false);
    expect(result.fundamentals).toHaveLength(1);
  });

  it("returns a pending empty result when there is no cached CVM data", async () => {
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn(),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn().mockRejectedValue(new Error("CVM offline")) },
      { listByTicker: vi.fn().mockResolvedValue([]) },
      { getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null) },
    );
    await expect(
      service.getFundamentalsByIssuer("PETR4", "33000167000101"),
    ).resolves.toMatchObject({
      fundamentals: [],
      fundamentalsRefresh: { status: "idle" },
    });
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
      { listByTicker: vi.fn() },
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
      { listByTicker: vi.fn() },
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
      { listByTicker: vi.fn() },
      { getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null) },
    );

    await expect(service.getByTicker("PETR4")).rejects.toBe(failure);
  });

  it("returns a recent prior-revision cache as stale while refresh is queued separately", async () => {
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
          sourceVersion: `${new Date().getUTCFullYear()}-cvm-v7`,
        }),
      ]),
    };
    const service = new StockAnalysisService(
      marketProvider,
      fundamentalsProvider,
      repository,
      rejectedScreenerLookups(),
    );

    const result = await service.getByTicker("PETR4");
    expect(result.fundamentalsIsStale).toBe(true);
    expect(result.fundamentals).toHaveLength(1);
    expect(fundamentalsProvider.getByTicker).not.toHaveBeenCalled();
  });

  it("reprocesses a v7 cache through a v8 claim and persists the v8 provider result", async () => {
    const currentVersion = `${new Date().getUTCFullYear()}-cvm-v8`;
    const refreshedPeriod = {
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
      parentNetIncome: "18",
      equity: "100",
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
    };
    const marketProvider = {
      getByTicker: vi.fn().mockResolvedValue(market),
      getQuoteByTicker: vi.fn(),
      searchTickers: vi.fn(),
    };
    const fundamentalsProvider = {
      getByTicker: vi.fn().mockResolvedValue([refreshedPeriod]),
    };
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([
        expiredCachePeriod({
          fetchedAt: new Date(),
          sourceVersion: `${new Date().getUTCFullYear()}-cvm-v7`,
        }),
      ]),
      claimRefresh: vi.fn().mockResolvedValue("v8-lease-token"),
      completeRefresh: vi.fn().mockResolvedValue(true),
    };
    const service = new StockAnalysisService(
      marketProvider,
      fundamentalsProvider,
      repository,
      rejectedScreenerLookups(),
    );

    const staleAnalysis = await service.getByTicker("PETR4");
    expect(staleAnalysis).toMatchObject({
      fundamentalsIsStale: true,
      fundamentals: [expect.objectContaining({ netIncome: "10" })],
    });

    const refresh = await service.requestFundamentalsRefresh(
      "PETR4",
      "33000167000101",
      "refresh-v8-cache",
    );
    expect(repository.claimRefresh).toHaveBeenCalledWith(
      "PETR4",
      "33000167000101",
      currentVersion,
    );
    await refresh.run?.();

    expect(fundamentalsProvider.getByTicker).toHaveBeenCalledWith({
      ticker: "PETR4",
      cnpj: "33000167000101",
    });
    expect(repository.completeRefresh).toHaveBeenCalledWith(
      "PETR4",
      "33000167000101",
      currentVersion,
      "v8-lease-token",
      [refreshedPeriod],
    );
  });

  it("serves a fresh cache with complete issuer provenance as current", async () => {
    const cached = expiredCachePeriod({
      fetchedAt: new Date(),
      sourceVersion: `${new Date().getUTCFullYear()}-cvm-v8`,
    });
    const service = new StockAnalysisService(
      {
        getByTicker: vi.fn().mockResolvedValue(market),
        getQuoteByTicker: vi.fn(),
        searchTickers: vi.fn(),
      },
      { getByTicker: vi.fn() },
      { listByTicker: vi.fn().mockResolvedValue([cached]) },
      rejectedScreenerLookups(),
    );

    await expect(service.getByTicker("PETR4")).resolves.toMatchObject({
      fundamentalsIsStale: false,
      fundamentalsFetchedAt: cached.fetchedAt.toISOString(),
      fundamentals: [expect.objectContaining({ referenceDate: "2025-12-31" })],
    });
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
      sourceVersion: `${new Date().getUTCFullYear()}-cvm-v8`,
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
      netIncomeAccount: "3.11",
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
  });

  it("uses a valid stale cache when CVM refresh succeeds without periods", async () => {
    const cachedPeriod = expiredCachePeriod({ periodEnd: null });
    const fetchedAt = cachedPeriod.fetchedAt;
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([cachedPeriod]),
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
    [
      "parent profit account",
      {
        parentNetIncome: "10",
        parentNetIncomeVersion: "1",
        parentNetIncomeAccount: null,
        parentNetIncomeConcept: "parent_attributable_net_income",
      },
    ],
    [
      "parent profit concept",
      {
        parentNetIncome: "10",
        parentNetIncomeVersion: "1",
        parentNetIncomeAccount: "3.11.01",
        parentNetIncomeConcept: null,
      },
    ],
    [
      "parent profit version",
      {
        parentNetIncome: "10",
        parentNetIncomeVersion: null,
        parentNetIncomeAccount: "3.11.01",
        parentNetIncomeConcept: "parent_attributable_net_income",
      },
    ],
    [
      "parent profit value",
      {
        parentNetIncome: "invalid",
        parentNetIncomeVersion: "1",
        parentNetIncomeAccount: "3.11.01",
        parentNetIncomeConcept: "parent_attributable_net_income",
      },
    ],
    [
      "minority profit account",
      {
        nonControllingNetIncome: "2",
        nonControllingNetIncomeVersion: "1",
        nonControllingNetIncomeAccount: null,
        nonControllingNetIncomeConcept: "non_controlling_net_income",
      },
    ],
    [
      "minority profit concept",
      {
        nonControllingNetIncome: "2",
        nonControllingNetIncomeVersion: "1",
        nonControllingNetIncomeAccount: "3.11.02",
        nonControllingNetIncomeConcept: null,
      },
    ],
    [
      "minority profit version",
      {
        nonControllingNetIncome: "2",
        nonControllingNetIncomeVersion: null,
        nonControllingNetIncomeAccount: "3.11.02",
        nonControllingNetIncomeConcept: "non_controlling_net_income",
      },
    ],
    [
      "minority profit value",
      {
        nonControllingNetIncome: "invalid",
        nonControllingNetIncomeVersion: "1",
        nonControllingNetIncomeAccount: "3.11.02",
        nonControllingNetIncomeConcept: "non_controlling_net_income",
      },
    ],
    [
      "minority equity account",
      {
        nonControllingEquity: "2",
        nonControllingEquityVersion: "1",
        nonControllingEquityAccount: null,
        nonControllingEquityConcept: "non_controlling_equity",
      },
    ],
    [
      "minority equity concept",
      {
        nonControllingEquity: "2",
        nonControllingEquityVersion: "1",
        nonControllingEquityAccount: "2.03.09",
        nonControllingEquityConcept: null,
      },
    ],
    [
      "minority equity version",
      {
        nonControllingEquity: "2",
        nonControllingEquityVersion: null,
        nonControllingEquityAccount: "2.03.09",
        nonControllingEquityConcept: "non_controlling_equity",
      },
    ],
    [
      "minority equity value",
      {
        nonControllingEquity: "invalid",
        nonControllingEquityVersion: "1",
        nonControllingEquityAccount: "2.03.09",
        nonControllingEquityConcept: "non_controlling_equity",
      },
    ],
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
    "does not serve an expired cache with incomplete %s provenance",
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
        },
        { getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null) },
      );

      await expect(service.getByTicker("PETR4")).resolves.toMatchObject({
        fundamentals: [],
        fundamentalsIsStale: false,
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
      },
      { getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null) },
    );

    await expect(service.getByTicker("PETR4")).resolves.toMatchObject({
      fundamentals: [],
      fundamentalsIsStale: false,
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
      },
      { getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null) },
    );

    await expect(service.getByTicker("PETR4")).resolves.toMatchObject({
      fundamentals: [],
      fundamentalsIsStale: false,
    });
  });

  it("uses a fresh validated Screener quote as an explicitly stale last observation", async () => {
    const observedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const screener = {
      getComparisonMetadata: vi
        .fn()
        .mockResolvedValue([{ ticker: "PETR4", cnpj: "33000167000101" }]),
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
      marketCap: 300_000_000_000,
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
        getComparisonMetadata: vi
          .fn()
          .mockResolvedValue([{ ticker: "PETR4", cnpj: "33000167000101" }]),
        getValidatedAnalysisQuote: vi.fn().mockResolvedValue(screenerQuote),
      };
      const repository = {
        listByTicker: vi.fn().mockResolvedValue([]),
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
        marketCap: 300_000_000_000,
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
      { listByTicker: vi.fn() },
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
        { listByTicker: vi.fn() },
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
    "does not serve an expired cache with inconsistent %s",
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
        },
        { getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null) },
      );

      await expect(service.getByTicker("PETR4")).resolves.toMatchObject({
        fundamentals: [],
        fundamentalsIsStale: false,
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
      sourceVersion: `${new Date().getUTCFullYear()}-cvm-v8`,
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
  });

  it("marks a v7 issuer cache stale so the current revision can refresh it", async () => {
    const year = new Date().getUTCFullYear();
    const cachedPeriod = expiredCachePeriod({
      fetchedAt: new Date(),
      sourceVersion: `${year}-cvm-v7`,
    });
    const marketProvider = {
      getByTicker: vi.fn().mockRejectedValue(new Error("market unavailable")),
      getQuoteByTicker: vi.fn(),
      searchTickers: vi.fn(),
    };
    const fundamentalsProvider = {
      getByTicker: vi.fn(),
    };
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([cachedPeriod]),
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

    expect(result.fundamentalsIsStale).toBe(true);
    expect(result.fundamentals[0]?.netIncome).toBe("10");
    expect(fundamentalsProvider.getByTicker).not.toHaveBeenCalled();
  });

  it("does not serve a cache when its CNPJ differs from the expected issuer", async () => {
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

    expect(result.fundamentals).toEqual([]);
    expect(result.fundamentalsIsStale).toBe(false);
    expect(fundamentalsProvider.getByTicker).not.toHaveBeenCalled();
    expect(marketProvider.getByTicker).not.toHaveBeenCalled();
  });

  it("serves only validated stale issuer cache and rejects invalid identity", async () => {
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
    expect(result.fundamentals).toEqual([]);
    expect(fundamentalsProvider.getByTicker).not.toHaveBeenCalled();
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
    };
    const service = new StockAnalysisService(
      marketProvider,
      fundamentalsProvider,
      repository,
      { getValidatedAnalysisQuote: vi.fn().mockResolvedValue(null) },
    );

    await expect(service.getByTicker("PETR4")).resolves.toMatchObject({
      cnpj: null,
      fundamentals: [],
    });
    await expect(
      service.requestFundamentalsRefresh("PETR4", null),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(fundamentalsProvider.getByTicker).not.toHaveBeenCalled();
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
    expect(fundamentalsProvider.getByTicker).not.toHaveBeenCalled();
  });

  it("treats a uniquely matched CVM unit as a confirmed equity instrument", async () => {
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
      { listByTicker: vi.fn().mockResolvedValue([]) },
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
      instrumentType: "stock",
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
      { listByTicker: vi.fn().mockResolvedValue([]) },
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
      { listByTicker: vi.fn() },
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

  it("keeps unexpected refresh failures out of the blocking analysis response", async () => {
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
      { listByTicker: vi.fn().mockResolvedValue([]) },
      rejectedScreenerLookups(),
    );

    await expect(service.getByTicker("PETR4")).resolves.toMatchObject({
      fundamentals: [],
      fundamentalsRefresh: { status: "idle" },
    });
    expect(fundamentalsProvider.getByTicker).not.toHaveBeenCalled();
  });

  it("keeps concurrent cold analysis reads fast and defers refresh to the lease endpoint", async () => {
    const fundamentalsProvider = {
      getByTicker: vi.fn(),
    };
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([]),
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
    const results = await Promise.all([first, second]);
    expect(results.map((result) => result.cnpj)).toEqual([
      "33000167000101",
      "33000167000101",
    ]);
    expect(
      results.map(({ fundamentals, fundamentalsRefresh }) => [
        fundamentals.length,
        fundamentalsRefresh?.status,
      ]),
    ).toEqual([
      [0, "idle"],
      [0, "idle"],
    ]);
    expect(fundamentalsProvider.getByTicker).not.toHaveBeenCalled();
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
