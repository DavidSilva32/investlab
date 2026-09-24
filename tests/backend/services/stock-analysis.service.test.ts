import { describe, expect, it, vi } from "vitest";
import {
  calculateAnalysisIndicators,
  StockAnalysisService,
} from "@/backend/services/stock-analysis.service";

describe("StockAnalysisService ticker search", () => {
  it("trims a valid search query and returns provider matches", async () => {
    const marketProvider = {
      getByTicker: vi.fn(),
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
    const marketProvider = { getByTicker: vi.fn(), searchTickers: vi.fn() };
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
});

it("calculates only ratios supported by compatible statement periods", () => {
  const indicators = calculateAnalysisIndicators([
    {
      referenceDate: "2025-12-31",
      periodType: "annual",
      sourceDocument: "DFP",
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
      periodType: "annual",
      sourceDocument: "DFP",
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

it("calculates P/L and P/VP only from market cap and the latest annual DFP", () => {
  const indicators = calculateAnalysisIndicators(
    [
      {
        referenceDate: "2025-12-31",
        periodType: "annual",
        sourceDocument: "DFP",
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
    const marketProvider = { getByTicker: vi.fn(), searchTickers: vi.fn() };
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
      searchTickers: vi.fn(),
    };
    const fundamentalsProvider = { getByTicker: vi.fn() };
    const cachedPeriod = {
      referenceDate: "2025-12-31",
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
    const repository = {
      listByTicker: vi.fn().mockResolvedValue([cachedPeriod]),
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
    ]);
    expect(fundamentalsProvider.getByTicker).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("surfaces the missing-CNPJ application error", async () => {
    const marketProvider = {
      getByTicker: vi.fn().mockResolvedValue({ ...market, cnpj: null }),
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
