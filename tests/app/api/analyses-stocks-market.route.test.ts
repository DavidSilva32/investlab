import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const controller = vi.hoisted(() => ({ getMarket: vi.fn() }));
const logger = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  withContext: (_context: unknown, operation: () => unknown) => operation(),
}));
vi.mock("@/backend/controllers/stock-analysis.controller", () => ({
  stockAnalysisController: controller,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { GET } from "@/app/api/analyses/stocks/[ticker]/market/route";

describe("stock market snapshot route", () => {
  it("returns the validated market snapshot", async () => {
    controller.getMarket.mockResolvedValue(Response.json({ ticker: "PETR4" }));
    const response = await GET(new Request("http://test"), {
      params: Promise.resolve({ ticker: "PETR4" }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ticker: "PETR4" });
  });

  it("keeps failures client-safe", async () => {
    controller.getMarket.mockRejectedValue(
      new ApplicationError("Ticker inválido.", 400),
    );
    const response = await GET(new Request("http://test"), {
      params: Promise.resolve({ ticker: "?" }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Ticker inválido.",
    });
  });

  it("returns a generic message for unexpected failures", async () => {
    controller.getMarket.mockRejectedValue(new Error("provider secret"));
    const response = await GET(new Request("http://test"), {
      params: Promise.resolve({ ticker: "PETR4" }),
    });
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      message: "Não foi possível consultar a cotação agora.",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "stock_analysis_market_failed",
      expect.objectContaining({ ticker: "PETR4", error: expect.any(Error) }),
    );
  });
});
