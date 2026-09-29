import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calculate: vi.fn(),
  info: vi.fn(),
}));
vi.mock("@/backend/services/stock-valuation.service", () => ({
  stockValuationService: { calculate: mocks.calculate },
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger: { info: mocks.info },
}));

import { StockValuationController } from "@/backend/controllers/stock-valuation.controller";

describe("StockValuationController", () => {
  beforeEach(() => {
    mocks.calculate.mockReset();
    mocks.info.mockReset();
  });

  it("coordinates valuation and returns the service result with the requested ticker", async () => {
    mocks.calculate.mockResolvedValue({
      status: "calculated",
      scenarios: [{ key: "base" }, { key: "upside" }],
      wacc: 0.1,
    });
    const response = await new StockValuationController().calculate(
      "TEST3",
      { explicitInputs: true },
      "request-8",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("request-8");
    expect(await response.json()).toEqual({
      ticker: "TEST3",
      status: "calculated",
      scenarios: [{ key: "base" }, { key: "upside" }],
      wacc: 0.1,
    });
    expect(mocks.calculate).toHaveBeenCalledWith("TEST3", {
      explicitInputs: true,
    });
    expect(mocks.info).toHaveBeenCalledTimes(2);
    expect(mocks.info.mock.calls[1]?.[1]).toEqual({
      requestId: "request-8",
      ticker: "TEST3",
      status: "calculated",
      scenarios: 2,
    });
  });
});
