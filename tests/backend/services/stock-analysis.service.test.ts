import { describe, expect, it, vi } from "vitest";
import { StockAnalysisService } from "@/backend/services/stock-analysis.service";

describe("StockAnalysisService", () => {
  it("returns market data when fundamentals are absent from the cache", async () => {
    const marketProvider = {
      getByTicker: vi.fn().mockResolvedValue({
        ticker: "PETR4",
        companyName: "Petrobras",
        cnpj: "33000167000101",
        price: 30,
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
