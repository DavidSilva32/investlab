import { describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  list: vi.fn(),
  saveInput: vi.fn(),
  saveBazinTargetYield: vi.fn(),
  deleteInput: vi.fn(),
}));
const logger = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock("@/backend/services/stock-opportunity-analysis.service", () => ({
  stockOpportunityAnalysisService: service,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { StockOpportunityAnalysisController } from "@/backend/controllers/stock-opportunity-analysis.controller";

describe("StockOpportunityAnalysisController", () => {
  it("logs and returns opportunity list results", async () => {
    service.list.mockResolvedValue({ opportunities: [{ ticker: "ABCD3" }] });
    const response = await new StockOpportunityAnalysisController().list(
      "req-list",
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      opportunities: [{ ticker: "ABCD3" }],
      requestId: "req-list",
    });
    expect(logger.info).toHaveBeenNthCalledWith(
      1,
      "stock_opportunity_analysis_requested",
      { requestId: "req-list" },
    );
    expect(logger.info).toHaveBeenNthCalledWith(
      2,
      "stock_opportunity_analysis_loaded",
      { requestId: "req-list", opportunities: 1 },
    );
  });

  it("parses and delegates valid input requests", async () => {
    const request = new Request("http://test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticker: "ABCD3" }),
    });
    service.saveInput.mockResolvedValue({ inputKey: "graham_eps", value: 2 });
    const response = await new StockOpportunityAnalysisController().saveInput(
      request,
      "req-save",
    );
    expect(service.saveInput).toHaveBeenCalledWith(
      { ticker: "ABCD3" },
      "req-save",
    );
    await expect(response.json()).resolves.toEqual({
      inputKey: "graham_eps",
      value: 2,
      requestId: "req-save",
    });
  });

  it("passes malformed JSON as null so service validation handles it", async () => {
    const request = new Request("http://test", {
      method: "POST",
      body: "not json",
    });
    service.saveInput.mockResolvedValue({ inputKey: "graham_eps" });
    await new StockOpportunityAnalysisController().saveInput(
      request,
      "req-bad",
    );
    expect(service.saveInput).toHaveBeenCalledWith(null, "req-bad");
  });

  it("extracts the configured yield from valid JSON and validates malformed bodies", async () => {
    const controller = new StockOpportunityAnalysisController();
    const request = new Request("http://test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bazinTargetYield: 7.25 }),
    });
    service.saveBazinTargetYield.mockResolvedValue({ bazinTargetYield: 7.25 });
    const response = await controller.saveBazinTargetYield(
      request,
      "req-yield",
    );
    expect(service.saveBazinTargetYield).toHaveBeenCalledWith(
      7.25,
      "req-yield",
    );
    await expect(response.json()).resolves.toEqual({
      bazinTargetYield: 7.25,
      requestId: "req-yield",
    });

    const malformed = new Request("http://test", {
      method: "POST",
      body: "not json",
    });
    service.saveBazinTargetYield.mockResolvedValue({ bazinTargetYield: 6 });
    await controller.saveBazinTargetYield(malformed, "req-malformed");
    expect(service.saveBazinTargetYield).toHaveBeenLastCalledWith(
      null,
      "req-malformed",
    );

    const missingField = new Request("http://test", {
      method: "POST",
      body: JSON.stringify({ wrong: 8 }),
    });
    await controller.saveBazinTargetYield(missingField, "req-field");
    expect(service.saveBazinTargetYield).toHaveBeenLastCalledWith(
      null,
      "req-field",
    );
  });

  it("deletes a specified input and returns the request id", async () => {
    service.deleteInput.mockResolvedValue({
      ticker: "ABCD3",
      inputKey: "graham_eps",
    });
    const response = await new StockOpportunityAnalysisController().deleteInput(
      "ABCD3",
      "graham_eps",
      "req-delete",
    );
    expect(service.deleteInput).toHaveBeenCalledWith(
      "ABCD3",
      "graham_eps",
      "req-delete",
    );
    await expect(response.json()).resolves.toEqual({
      ticker: "ABCD3",
      inputKey: "graham_eps",
      requestId: "req-delete",
    });
  });
});
