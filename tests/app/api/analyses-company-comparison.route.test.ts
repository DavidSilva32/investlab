import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const mocks = vi.hoisted(() => ({
  compare: vi.fn(),
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    withContext: (_context: unknown, operation: () => unknown) => operation(),
  },
}));
vi.mock("@/backend/controllers/stock-comparison.controller", () => ({
  stockComparisonController: { compare: mocks.compare },
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger: mocks.logger }));

import { POST } from "@/app/api/analyses/companies/compare/route";

describe("company comparison route", () => {
  it("forwards the selected tickers and request ID", async () => {
    mocks.compare.mockResolvedValue(
      Response.json({ companies: [{ ticker: "PETR3" }] }),
    );
    const response = await POST(
      new Request("http://test/api/analyses/companies/compare", {
        method: "POST",
        headers: { "x-request-id": "compare-1" },
        body: JSON.stringify({ tickers: ["PETR3", "VALE3"] }),
      }),
    );
    expect(mocks.compare).toHaveBeenCalledWith(
      { tickers: ["PETR3", "VALE3"] },
      "compare-1",
    );
    expect(response.status).toBe(200);
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await POST(
      new Request("http://test/api/analyses/companies/compare", {
        method: "POST",
        body: "{invalid",
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      message: "O corpo da comparação não é um JSON válido.",
      requestId: expect.any(String),
    });
  });

  it("preserves safe application status and retry guidance", async () => {
    mocks.compare.mockRejectedValue(
      new ApplicationError("Tente novamente em instantes.", 429, 20),
    );
    const response = await POST(
      new Request("http://test/api/analyses/companies/compare", {
        method: "POST",
        body: JSON.stringify({ tickers: ["PETR3", "VALE3"] }),
      }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("20");
  });

  it("uses a client-safe fallback for unexpected failures", async () => {
    mocks.compare.mockRejectedValue(new Error("internal secret"));
    const response = await POST(
      new Request("http://test/api/analyses/companies/compare", {
        method: "POST",
        body: JSON.stringify({ tickers: ["PETR3", "VALE3"] }),
      }),
    );
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      message: "Não foi possível comparar as empresas agora.",
    });
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "stock_comparison_failed",
      expect.objectContaining({ errorType: "Error" }),
    );
  });

  it("logs non-Error thrown values by type without exposing them", async () => {
    mocks.compare.mockRejectedValue({ internal: "secret" });
    const response = await POST(
      new Request("http://test/api/analyses/companies/compare", {
        method: "POST",
        body: JSON.stringify({ tickers: ["PETR3", "VALE3"] }),
      }),
    );

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.message).not.toContain("internal");
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "stock_comparison_failed",
      expect.objectContaining({ errorType: "object" }),
    );
  });
});
