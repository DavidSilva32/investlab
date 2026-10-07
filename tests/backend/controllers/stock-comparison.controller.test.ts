import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  compare: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@/backend/services/stock-comparison.service", () => ({
  stockComparisonService: { compare: mocks.compare },
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger: { info: mocks.info },
}));

import { StockComparisonController } from "@/backend/controllers/stock-comparison.controller";

describe("StockComparisonController", () => {
  beforeEach(() => {
    mocks.compare.mockReset();
    mocks.info.mockReset();
  });

  it("forwards the request and responds with its request ID", async () => {
    const result = { sector: "Bancos", companies: [{ ticker: "ITUB4" }] };
    mocks.compare.mockResolvedValue(result);
    const controller = new StockComparisonController();

    const response = await controller.compare(
      { tickers: ["ITUB4", "SANB11"] },
      "request-114",
    );

    expect(mocks.compare).toHaveBeenCalledWith(
      { tickers: ["ITUB4", "SANB11"] },
      "request-114",
    );
    expect(response.headers.get("x-request-id")).toBe("request-114");
    await expect(response.json()).resolves.toEqual(result);
    expect(mocks.info).toHaveBeenCalledWith("stock_comparison_completed", {
      requestId: "request-114",
      issuerCount: 1,
      sector: "Bancos",
    });
  });
});
