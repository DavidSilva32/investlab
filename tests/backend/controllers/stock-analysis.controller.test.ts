import { describe, expect, it, vi } from "vitest";
import { StockAnalysisController } from "@/backend/controllers/stock-analysis.controller";
import { stockAnalysisService } from "@/backend/services/stock-analysis.service";

vi.mock("@/backend/services/stock-analysis.service", () => ({
  stockAnalysisService: { getMarketByTicker: vi.fn() },
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("StockAnalysisController market stage", () => {
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
});
