import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateOpportunityMethods,
  StockOpportunityAnalysisService,
} from "@/backend/services/stock-opportunity-analysis.service";
import { ApplicationError } from "@/backend/errors/application-error";

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn() }));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

const keys = [
  "graham_eps",
  "graham_book_value_per_share",
  "bazin_dividend_per_share",
] as const;

function input(
  inputKey: (typeof keys)[number],
  value: number,
  asOf = "2026-09-30",
) {
  return { inputKey, value, source: `Source ${inputKey}`, asOf };
}

function deps() {
  return {
    positions: { listCurrent: vi.fn().mockResolvedValue([]) },
    market: {
      getQuoteByTicker: vi.fn().mockResolvedValue(null),
      searchTickers: vi.fn(async (ticker: string) => [
        { ticker, name: ticker },
      ]),
    },
    fundamentals: { listByTicker: vi.fn().mockResolvedValue([]) },
    manual: {
      listByTickers: vi.fn().mockResolvedValue([]),
      listByTicker: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    settings: {
      get: vi.fn().mockResolvedValue({
        bazinTargetYield: "5",
        updatedAt: new Date("2026-09-30T00:00:00.000Z"),
      }),
      saveBazinTargetYield: vi.fn(),
    },
    dividends: { getLastTwelveMonths: vi.fn().mockResolvedValue(null) },
  };
}

describe("calculateOpportunityMethods", () => {
  it("calculates Graham and Bazin references and compares them with a quote", () => {
    const result = calculateOpportunityMethods(
      [
        input("graham_eps", 2),
        input("graham_book_value_per_share", 20),
        input("bazin_dividend_per_share", 1, "2025-09-30"),
      ],
      10,
      5,
    );

    expect(result.graham.value).toBe(Math.sqrt(900));
    expect(result.graham.differencePercent).toBeCloseTo(66.6667, 4);
    expect(result.graham.asOf).toBe("2026-09-30");
    expect(result.graham.source).toContain("Source graham_eps");
    expect(result.graham.unavailableReason).toBeNull();
    expect(result.bazin.value).toBe(20);
    expect(result.bazin.differencePercent).toBe(50);
    expect(result.bazin.asOf).toBe("2025-09-30");
    expect(result.bazin.source).toContain("Source bazin_dividend_per_share");
    expect(result.bazin.unavailableReason).toBeNull();
  });

  it("explains missing inputs and unavailable quotes without inventing values", () => {
    const missing = calculateOpportunityMethods([], null, 5);
    expect(missing.graham.value).toBeNull();
    expect(missing.graham.differencePercent).toBeNull();
    expect(missing.graham.asOf).toBeNull();
    expect(missing.graham.source).toBeNull();
    expect(missing.graham.unavailableReason).toBeTruthy();
    expect(missing.bazin.value).toBeNull();
    expect(missing.bazin.differencePercent).toBeNull();
    expect(missing.bazin.asOf).toBeNull();
    expect(missing.bazin.source).toBeNull();
    expect(missing.bazin.unavailableReason).toBeTruthy();

    const noQuote = calculateOpportunityMethods(
      [
        input("graham_eps", 2),
        input("graham_book_value_per_share", 20),
        input("bazin_dividend_per_share", 1),
      ],
      null,
      5,
    );
    expect(noQuote.graham.value).toBe(30);
    expect(noQuote.graham.differencePercent).toBeNull();
    expect(noQuote.graham.unavailableReason).toBeTruthy();
    expect(noQuote.bazin.value).toBe(20);
    expect(noQuote.bazin.differencePercent).toBeNull();
    expect(noQuote.bazin.unavailableReason).toBeTruthy();
  });

  it("keeps Graham unavailable when per-share values have different base dates", () => {
    const result = calculateOpportunityMethods(
      [
        input("graham_eps", 2, "2025-12-31"),
        input("graham_book_value_per_share", 20, "2024-12-31"),
      ],
      10,
      5,
    );
    expect(result.graham.value).toBeNull();
    expect(result.graham.differencePercent).toBeNull();
    expect(result.graham.asOf).toBe("2025-12-31");
    expect(result.graham.source).toContain("Source graham_eps");
    expect(result.graham.unavailableReason).toContain(
      "precisam ter a mesma data-base",
    );
  });

  it("omits non-finite references and does not compare with an invalid price", () => {
    const result = calculateOpportunityMethods(
      [
        input("graham_eps", Number.MAX_VALUE),
        input("graham_book_value_per_share", Number.MAX_VALUE),
        input("bazin_dividend_per_share", 1),
      ],
      0,
      0,
    );
    expect(result.graham.value).toBeNull();
    expect(result.graham.differencePercent).toBeNull();
    expect(result.bazin.value).toBeNull();
    expect(result.bazin.differencePercent).toBeNull();
  });
});

describe("StockOpportunityAnalysisService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty list without querying per-ticker providers", async () => {
    const mock = deps();
    const service = new StockOpportunityAnalysisService(
      mock.positions,
      mock.market,
      mock.fundamentals,
      mock.manual,
      mock.settings,
      mock.dividends,
    );
    await expect(service.list("request-1")).resolves.toMatchObject({
      opportunities: [],
      asOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect(mock.manual.listByTickers).toHaveBeenCalledWith([]);
    expect(mock.market.getQuoteByTicker).not.toHaveBeenCalled();
    expect(mock.fundamentals.listByTicker).not.toHaveBeenCalled();
  });

  it("includes only exact stock-classifier matches, excluding ETF, FII and BDR tickers", async () => {
    const mock = deps();
    mock.positions.listCurrent.mockResolvedValue(
      ["PETR4", "BOVA11", "HGLG11", "AAPL34"].map((assetCode) => ({
        source: "B3",
        assetCode,
        product: assetCode,
        quantity: "1",
      })),
    );
    mock.market.searchTickers.mockImplementation(async (ticker: string) =>
      ticker === "PETR4" ? [{ ticker: "PETR4", name: "Petrobras" }] : [],
    );
    const service = new StockOpportunityAnalysisService(
      mock.positions,
      mock.market,
      mock.fundamentals,
      mock.manual,
      mock.settings,
      mock.dividends,
    );

    const result = await service.list("request-classifier");
    expect(result.opportunities.map(({ ticker }) => ticker)).toEqual(["PETR4"]);
    expect(mock.market.searchTickers).toHaveBeenCalledTimes(4);
    expect(mock.market.searchTickers).toHaveBeenCalledWith("BOVA11");
    expect(mock.market.searchTickers).toHaveBeenCalledWith("HGLG11");
    expect(mock.market.searchTickers).toHaveBeenCalledWith("AAPL34");
    expect(mock.market.getQuoteByTicker).toHaveBeenCalledTimes(1);
    expect(result.classificationStatus).toBe("resolved");
  });

  it("fails closed and reports unavailable classification when every ticker lookup fails", async () => {
    const mock = deps();
    mock.positions.listCurrent.mockResolvedValue([
      { source: "B3", assetCode: "PETR4", product: "Petrobras", quantity: "1" },
      { source: "B3", assetCode: "VALE3", product: "Vale", quantity: "2" },
    ]);
    mock.market.searchTickers.mockRejectedValue(
      new Error("lookup unavailable"),
    );
    const service = new StockOpportunityAnalysisService(
      mock.positions,
      mock.market,
      mock.fundamentals,
      mock.manual,
      mock.settings,
      mock.dividends,
    );

    const result = await service.list("request-classifier-unavailable");
    expect(result.opportunities).toEqual([]);
    expect(result.classificationStatus).toBe("unavailable");
    expect(result.classificationLookupFailures).toBe(2);
    expect(mock.market.getQuoteByTicker).not.toHaveBeenCalled();
  });

  it("reports partial classification failures while keeping verified stocks", async () => {
    const mock = deps();
    mock.positions.listCurrent.mockResolvedValue([
      { source: "B3", assetCode: "PETR4", product: "Petrobras", quantity: "1" },
      { source: "B3", assetCode: "VALE3", product: "Vale", quantity: "2" },
    ]);
    mock.market.searchTickers.mockImplementation(async (ticker: string) => {
      if (ticker === "VALE3") throw new Error("lookup unavailable");
      return [{ ticker: "PETR4", name: "Petrobras" }];
    });
    const service = new StockOpportunityAnalysisService(
      mock.positions,
      mock.market,
      mock.fundamentals,
      mock.manual,
      mock.settings,
      mock.dividends,
    );

    const result = await service.list("request-classifier-partial");
    expect(result.opportunities.map(({ ticker }) => ticker)).toEqual(["PETR4"]);
    expect(result.classificationStatus).toBe("partial");
    expect(result.classificationLookupFailures).toBe(1);
  });

  it("filters invalid positions, groups tickers and tolerates unavailable sources", async () => {
    const mock = deps();
    mock.positions.listCurrent.mockResolvedValue([
      {
        source: "MANUAL",
        assetCode: "PETR4",
        product: "ignored",
        quantity: "1",
      },
      { source: "B3", assetCode: null, product: "ignored", quantity: "1" },
      { source: "B3", assetCode: "INVALID", product: "ignored", quantity: "1" },
      {
        source: "B3",
        assetCode: "petr4",
        product: "Petrobras",
        quantity: "2",
        referenceDate: "2026-09-30",
      },
      {
        source: "B3",
        assetCode: "PETR4",
        product: "Second lot",
        quantity: "3",
        referenceDate: "2026-09-29",
      },
    ]);
    mock.manual.listByTickers.mockResolvedValue([
      {
        ticker: "PETR4",
        inputKey: "graham_eps",
        value: "2",
        source: "Report",
        asOf: "2026-09-30",
      },
    ]);
    mock.market.getQuoteByTicker.mockRejectedValue(new Error("market offline"));
    mock.fundamentals.listByTicker.mockRejectedValue(
      new Error("fundamentals offline"),
    );
    const service = new StockOpportunityAnalysisService(
      mock.positions,
      mock.market,
      mock.fundamentals,
      mock.manual,
      mock.settings,
      mock.dividends,
    );

    const result = await service.list("request-2");
    expect(mock.manual.listByTickers).toHaveBeenCalledWith(["PETR4"]);
    expect(mock.market.getQuoteByTicker).toHaveBeenCalledTimes(1);
    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0]).toMatchObject({
      ticker: "PETR4",
      name: "Petrobras",
      quantity: 5,
      positionDate: "2026-09-30",
      price: null,
      priceAsOf: null,
      fundamentalsAsOf: null,
      financialPeriods: [],
      inputs: [
        {
          inputKey: "graham_eps",
          value: 2,
          source: "Report",
          asOf: "2026-09-30",
        },
        {
          inputKey: "graham_book_value_per_share",
          value: null,
          source: null,
          asOf: null,
        },
        {
          inputKey: "bazin_dividend_per_share",
          value: null,
          source: null,
          asOf: null,
        },
      ],
    });
  });

  it("falls back to the ticker when an imported position has no product name", async () => {
    const mock = deps();
    mock.positions.listCurrent.mockResolvedValue([
      {
        source: "B3",
        assetCode: "VALE3",
        product: null,
        quantity: "1",
      },
    ]);
    const service = new StockOpportunityAnalysisService(
      mock.positions,
      mock.market,
      mock.fundamentals,
      mock.manual,
      mock.settings,
      mock.dividends,
    );
    const result = await service.list();
    expect(result.opportunities[0]?.name).toBe("VALE3");
  });

  it("returns quotes, periods and all manual input slots", async () => {
    const mock = deps();
    mock.positions.listCurrent.mockResolvedValue([
      {
        source: "B3",
        assetCode: "VALE3",
        product: "Vale",
        quantity: "4",
        referenceDate: null,
      },
    ]);
    mock.market.getQuoteByTicker.mockResolvedValue({
      price: 70,
      observedAt: new Date("2026-09-30T00:00:00.000Z"),
    });
    mock.fundamentals.listByTicker.mockResolvedValue([
      { referenceDate: "2025-12-31", sourceDocument: "DFP" },
    ]);
    mock.manual.listByTickers.mockResolvedValue([
      {
        ticker: "VALE3",
        inputKey: "bazin_dividend_per_share",
        value: "3",
        source: "Issuer",
        asOf: "2025-12-31",
      },
    ]);
    mock.dividends.getLastTwelveMonths.mockResolvedValue({
      value: 2.5,
      windowStart: "2025-10-01",
      windowEnd: "2026-09-30",
      observedPayments: 4,
      coverageComplete: false,
      source: "BRAPI",
      unavailableReason: "Not complete",
    });
    const service = new StockOpportunityAnalysisService(
      mock.positions,
      mock.market,
      mock.fundamentals,
      mock.manual,
      mock.settings,
      mock.dividends,
    );
    const result = await service.list();
    expect(result.opportunities[0]).toMatchObject({
      ticker: "VALE3",
      positionDate: null,
      price: 70,
      priceAsOf: "2026-09-30T00:00:00.000Z",
      fundamentalsAsOf: "2025-12-31",
      automaticDividend: {
        value: 2.5,
        windowStart: "2025-10-01",
        windowEnd: "2026-09-30",
        observedPayments: 4,
        coverageComplete: false,
        source: "BRAPI",
        unavailableReason: "Not complete",
      },
      financialPeriods: [
        { referenceDate: "2025-12-31", sourceDocument: "DFP" },
      ],
      inputs: [
        { inputKey: "graham_eps", value: null, source: null, asOf: null },
        {
          inputKey: "graham_book_value_per_share",
          value: null,
          source: null,
          asOf: null,
        },
        {
          inputKey: "bazin_dividend_per_share",
          value: 3,
          source: "Issuer",
          asOf: "2025-12-31",
        },
      ],
    });
    expect(result.settings).toMatchObject({
      bazinTargetYield: 5,
      initializedAt: "2026-09-30",
    });
    expect(mock.dividends.getLastTwelveMonths).toHaveBeenCalledWith("VALE3");
  });

  it("uses configured Bazin yield and null initialization date when loading settings", async () => {
    const mock = deps();
    mock.positions.listCurrent.mockResolvedValue([
      {
        source: "B3",
        assetCode: "VALE3",
        product: "Vale",
        quantity: "1",
      },
    ]);
    mock.settings.get.mockResolvedValue({
      bazinTargetYield: "0",
      updatedAt: null,
    });
    mock.market.getQuoteByTicker.mockResolvedValue({
      price: 10,
      observedAt: null,
    });
    mock.dividends.getLastTwelveMonths.mockRejectedValue(new Error("offline"));
    const service = new StockOpportunityAnalysisService(
      mock.positions,
      mock.market,
      mock.fundamentals,
      mock.manual,
      mock.settings,
      mock.dividends,
    );
    const result = await service.list();
    expect(result.settings).toEqual({
      bazinTargetYield: 0,
      initializedAt: null,
    });
    expect(result.opportunities[0].automaticDividend).toBeNull();
    expect(result.opportunities[0].positionDate).toBeNull();
  });

  it("validates manual input, requires an imported B3 position and persists valid values", async () => {
    const mock = deps();
    const service = new StockOpportunityAnalysisService(
      mock.positions,
      mock.market,
      mock.fundamentals,
      mock.manual,
      mock.settings,
      mock.dividends,
    );
    await expect(service.saveInput({}, "request-3")).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      service.saveInput({
        ticker: "ABCD3",
        inputKey: "bazin_target_yield",
        value: 101,
        source: "Test",
        asOf: "2026-09-30",
      }),
    ).rejects.toBeInstanceOf(ApplicationError);
    await expect(
      service.saveInput(
        {
          ticker: "ABCD3",
          inputKey: "graham_eps",
          value: 3,
          source: "Test",
          asOf: "2026-09-30",
        },
        "request-4",
      ),
    ).rejects.toMatchObject({ statusCode: 404 });

    mock.positions.listCurrent.mockResolvedValue([
      { source: "B3", assetCode: "abcd3", product: "ABC", quantity: "1" },
    ]);
    mock.manual.upsert.mockResolvedValue({
      ticker: "ABCD3",
      inputKey: "graham_eps",
      value: "3.5",
      source: "Annual report",
      asOf: "2026-09-30",
    });
    await expect(
      service.saveInput(
        {
          ticker: " abcd3 ",
          inputKey: "graham_eps",
          value: 3.5,
          source: " Annual report ",
          asOf: "2026-09-30",
        },
        "request-5",
      ),
    ).resolves.toEqual({
      inputKey: "graham_eps",
      value: 3.5,
      source: "Annual report",
      asOf: "2026-09-30",
    });
    expect(mock.manual.upsert).toHaveBeenCalledWith({
      ticker: "ABCD3",
      inputKey: "graham_eps",
      value: 3.5,
      source: "Annual report",
      asOf: "2026-09-30",
    });
    expect(logger.info).toHaveBeenCalledWith(
      "stock_opportunity_manual_input_saved",
      expect.objectContaining({ requestId: "request-5", ticker: "ABCD3" }),
    );
  });

  it("validates manual input deletion and reports the result", async () => {
    const mock = deps();
    const service = new StockOpportunityAnalysisService(
      mock.positions,
      mock.market,
      mock.fundamentals,
      mock.manual,
      mock.settings,
      mock.dividends,
    );
    await expect(service.deleteInput("?", "graham_eps")).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      service.deleteInput("ABCD3", "invalid" as never),
    ).rejects.toMatchObject({ statusCode: 400 });
    mock.manual.delete.mockResolvedValue(null);
    await expect(
      service.deleteInput("ABCD3", "graham_eps"),
    ).rejects.toMatchObject({ statusCode: 404 });
    mock.manual.delete.mockResolvedValue({ id: "deleted" });
    await expect(
      service.deleteInput(" abcd3 ", "graham_eps", "request-6"),
    ).resolves.toEqual({ ticker: "ABCD3", inputKey: "graham_eps" });
    expect(logger.info).toHaveBeenCalledWith(
      "stock_opportunity_manual_input_deleted",
      expect.objectContaining({ requestId: "request-6", ticker: "ABCD3" }),
    );
  });

  it("validates and persists the global Bazin target yield", async () => {
    const mock = deps();
    const service = new StockOpportunityAnalysisService(
      mock.positions,
      mock.market,
      mock.fundamentals,
      mock.manual,
      mock.settings,
      mock.dividends,
    );
    await expect(service.saveBazinTargetYield(0)).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(service.saveBazinTargetYield(101)).rejects.toMatchObject({
      statusCode: 400,
    });
    mock.settings.saveBazinTargetYield.mockResolvedValue({
      bazinTargetYield: "7.25",
      updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    });
    await expect(
      service.saveBazinTargetYield(7.25, "req-yield"),
    ).resolves.toEqual({
      bazinTargetYield: 7.25,
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    expect(mock.settings.saveBazinTargetYield).toHaveBeenCalledWith(7.25);
    expect(logger.info).toHaveBeenCalledWith(
      "stock_opportunity_bazin_yield_updated",
      { requestId: "req-yield" },
    );
  });
});
