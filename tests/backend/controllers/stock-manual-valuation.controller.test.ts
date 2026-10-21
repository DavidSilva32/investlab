import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn() }));
vi.mock("@/backend/services/stock-manual-valuation.service", () => ({
  stockManualValuationService: service,
}));

import { StockManualValuationController } from "@/backend/controllers/stock-manual-valuation.controller";

describe("StockManualValuationController", () => {
  const controller = new StockManualValuationController();

  beforeEach(() => vi.clearAllMocks());

  it("returns owner-scoped inputs with the request id", async () => {
    service.list.mockResolvedValue({ ticker: "ITUB4", inputs: [] });
    const response = await controller.list("ITUB4", "request-1");
    await expect(response.json()).resolves.toEqual({
      ticker: "ITUB4",
      inputs: [],
      requestId: "request-1",
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-request-id")).toBe("request-1");
  });

  it("parses JSON and delegates the per-share value", async () => {
    service.save.mockResolvedValue({ inputKey: "graham_eps", value: 3.2 });
    const request = new Request("http://test", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: 3.2 }),
    });
    const response = await controller.save(
      "itub4",
      "graham_eps",
      request,
      "request-2",
    );
    expect(service.save).toHaveBeenCalledWith("itub4", "graham_eps", {
      value: 3.2,
    });
    await expect(response.json()).resolves.toEqual({
      inputKey: "graham_eps",
      value: 3.2,
      ticker: "ITUB4",
      requestId: "request-2",
    });
  });

  it("passes malformed JSON to service validation", async () => {
    service.save.mockResolvedValue({ inputKey: "graham_eps" });
    await controller.save(
      "ITUB4",
      "graham_eps",
      new Request("http://test", { method: "PUT", body: "bad json" }),
      "request-3",
    );
    expect(service.save).toHaveBeenCalledWith("ITUB4", "graham_eps", null);
  });
});
