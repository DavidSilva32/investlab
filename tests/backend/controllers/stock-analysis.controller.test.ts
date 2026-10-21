import { describe, expect, it, vi } from "vitest";
import { StockAnalysisController } from "@/backend/controllers/stock-analysis.controller";
import { stockAnalysisService } from "@/backend/services/stock-analysis.service";

vi.mock("@/backend/services/stock-analysis.service", () => ({
  stockAnalysisService: {
    searchTickers: vi.fn(),
    getByTicker: vi.fn(),
    getMarketByTicker: vi.fn(),
    getHistoryByTicker: vi.fn(),
    requestFundamentalsRefresh: vi.fn(),
    refreshDueFundamentals: vi.fn(),
  },
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("StockAnalysisController market stage", () => {
  it("delegates ticker search and returns the request ID", async () => {
    vi.mocked(stockAnalysisService.searchTickers).mockResolvedValue([
      { ticker: "PETR4", name: "Petrobras" },
    ] as never);

    const response = await new StockAnalysisController().search(
      "Petrobras",
      "request-search",
    );

    expect(stockAnalysisService.searchTickers).toHaveBeenCalledWith(
      "Petrobras",
      "request-search",
    );
    await expect(response.json()).resolves.toMatchObject({
      requestId: "request-search",
      results: [{ ticker: "PETR4" }],
    });
  });

  it("delegates full stock analysis and returns its payload", async () => {
    const analysis = { ticker: "PETR4", fundamentals: [] };
    vi.mocked(stockAnalysisService.getByTicker).mockResolvedValue(
      analysis as never,
    );

    const response = await new StockAnalysisController().get(
      "PETR4",
      "request-analysis",
    );

    expect(stockAnalysisService.getByTicker).toHaveBeenCalledWith(
      "PETR4",
      "request-analysis",
    );
    await expect(response.json()).resolves.toEqual(analysis);
  });

  it("delegates history lookup and marks the response private", async () => {
    const history = { ticker: "PETR4", history: [], historyStatus: "empty" };
    vi.mocked(stockAnalysisService.getHistoryByTicker).mockResolvedValue(
      history as never,
    );

    const response = await new StockAnalysisController().getHistory(
      "PETR4",
      "request-history",
    );

    expect(stockAnalysisService.getHistoryByTicker).toHaveBeenCalledWith(
      "PETR4",
      "request-history",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual(history);
  });

  it("delegates to the service and returns a private, non-cacheable response", async () => {
    const snapshot = {
      ticker: "PETR4",
      cnpj: "33000167000101",
      price: 30,
    };
    vi.mocked(stockAnalysisService.getMarketByTicker).mockResolvedValue(
      snapshot as never,
    );
    const controller = new StockAnalysisController();

    const response = await controller.getMarket("PETR4", "request-1");

    expect(stockAnalysisService.getMarketByTicker).toHaveBeenCalledWith(
      "PETR4",
      "request-1",
    );
    expect(response.headers.get("x-request-id")).toBe("request-1");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual(snapshot);
  });

  it("resolves the issuer before requesting a fundamentals refresh", async () => {
    vi.mocked(stockAnalysisService.getMarketByTicker).mockResolvedValue({
      ticker: "ITUB4",
      cnpj: "60701190000104",
    } as never);
    const refresh = {
      state: { status: "running", retryAfter: null, errorCode: null },
      run: vi.fn(),
    };
    vi.mocked(
      stockAnalysisService.requestFundamentalsRefresh,
    ).mockResolvedValue(refresh as never);
    const controller = new StockAnalysisController();

    await expect(
      controller.requestFundamentalsRefresh("itub4", "request-refresh"),
    ).resolves.toEqual(refresh);

    expect(stockAnalysisService.getMarketByTicker).toHaveBeenCalledWith(
      "itub4",
      "request-refresh",
    );
    expect(
      stockAnalysisService.requestFundamentalsRefresh,
    ).toHaveBeenCalledWith("ITUB4", "60701190000104", "request-refresh");
  });

  it("delegates weekly due-fundamentals refresh to the service", async () => {
    const result = {
      selectedIssuers: 2,
      attemptedIssuers: 2,
      updatedIssuers: 1,
      unavailableIssuers: 1,
      remainingIssuers: 0,
    };
    vi.mocked(stockAnalysisService.refreshDueFundamentals).mockResolvedValue(
      result as never,
    );

    await expect(
      new StockAnalysisController().refreshDueFundamentals("request-weekly"),
    ).resolves.toEqual(result);
    expect(stockAnalysisService.refreshDueFundamentals).toHaveBeenCalledWith(
      "request-weekly",
    );
  });
});
