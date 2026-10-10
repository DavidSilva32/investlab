import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const controller = vi.hoisted(() => ({ getHistory: vi.fn() }));
const logger = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  withContext: (_context: unknown, operation: () => unknown) => operation(),
}));
vi.mock("@/backend/controllers/stock-analysis.controller", () => ({
  stockAnalysisController: controller,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { GET } from "@/app/api/analyses/stocks/[ticker]/history/route";

describe("stock history route", () => {
  it("returns refreshed history and preserves the request id", async () => {
    controller.getHistory.mockResolvedValue(
      Response.json({
        ticker: "PETR4",
        history: [{ date: "2026-09-30", close: 34.2 }],
        historyStatus: "available",
      }),
    );

    const response = await GET(
      new Request("http://test", { headers: { "x-request-id": "history-1" } }),
      { params: Promise.resolve({ ticker: "PETR4" }) },
    );

    expect(controller.getHistory).toHaveBeenCalledWith("PETR4", "history-1");
    expect(response.headers.get("x-request-id")).toBe("history-1");
    await expect(response.json()).resolves.toMatchObject({
      ticker: "PETR4",
      historyStatus: "available",
    });
  });

  it("returns application errors and Retry-After without leaking provider details", async () => {
    controller.getHistory.mockRejectedValue(
      new ApplicationError("Aguarde antes de tentar novamente.", 429, 20),
    );

    const response = await GET(new Request("http://test"), {
      params: Promise.resolve({ ticker: "PETR4" }),
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("20");
    await expect(response.json()).resolves.toEqual({
      message: "Aguarde antes de tentar novamente.",
    });
  });

  it("maps unexpected provider errors to a safe 502 response", async () => {
    controller.getHistory.mockRejectedValue(
      new Error("internal provider token"),
    );

    const response = await GET(new Request("http://test"), {
      params: Promise.resolve({ ticker: "PETR4" }),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      message: "Não foi possível atualizar o histórico agora.",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "stock_analysis_history_failed",
      expect.objectContaining({ ticker: "PETR4", error: expect.any(Error) }),
    );
  });
});
