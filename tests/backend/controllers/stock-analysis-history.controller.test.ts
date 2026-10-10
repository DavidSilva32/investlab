import { describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({ getHistoryByTicker: vi.fn() }));
vi.mock("@/backend/services/stock-analysis.service", () => ({
  stockAnalysisService: service,
}));

import { stockAnalysisController } from "@/backend/controllers/stock-analysis.controller";

describe("StockAnalysisController history", () => {
  it("returns the isolated provider history and request id", async () => {
    const result = {
      ticker: "PETR4",
      history: [{ date: "2026-09-30", close: 34.2 }],
      historyStatus: "available",
    };
    service.getHistoryByTicker.mockResolvedValue(result);

    const response = await stockAnalysisController.getHistory(
      "PETR4",
      "history-request",
    );

    expect(service.getHistoryByTicker).toHaveBeenCalledWith(
      "PETR4",
      "history-request",
    );
    expect(response.headers.get("x-request-id")).toBe("history-request");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual(result);
  });
});
