vi.mock("@/infrastructure/auth/authorization", () => ({
  getAuthenticatedUser: vi.fn(async () => ({ id: "owner-1", role: "ADMIN" })),
  isLegacyPortfolioOwner: vi.fn(async () => true),
}));
import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const mocks = vi.hoisted(() => ({
  compare: vi.fn(),
  getRefreshStatus: vi.fn(),
  after: vi.fn(),
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    withContext: (_context: unknown, operation: () => unknown) => operation(),
  },
}));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/backend/controllers/stock-comparison.controller", () => ({
  stockComparisonController: {
    compare: mocks.compare,
    getRefreshStatus: mocks.getRefreshStatus,
  },
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger: mocks.logger }));

import { POST } from "@/app/api/analyses/companies/compare/route";
import { GET } from "@/app/api/analyses/companies/compare/route";

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
      expect.any(Function),
    );
    expect(response.status).toBe(200);
    const scheduleAfterResponse = mocks.compare.mock.calls[0]?.[2] as
      ((work: () => Promise<void>) => void) | undefined;
    scheduleAfterResponse?.(async () => {});
    expect(mocks.after).toHaveBeenCalledWith(expect.any(Function));
  });

  it("reads comparison refresh status without scheduling another refresh", async () => {
    mocks.getRefreshStatus.mockResolvedValue(Response.json({ companies: [] }));
    const response = await GET(
      new Request(
        "http://test/api/analyses/companies/compare?tickers=PETR3,VALE3",
      ),
    );
    expect(response.status).toBe(200);
    expect(mocks.getRefreshStatus).toHaveBeenCalledWith(
      { tickers: ["PETR3", "VALE3"] },
      expect.any(String),
    );
    expect(mocks.compare).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("handles a status request with no ticker query", async () => {
    mocks.getRefreshStatus.mockResolvedValue(Response.json({ companies: [] }));
    const response = await GET(
      new Request("http://test/api/analyses/companies/compare"),
    );

    expect(response.status).toBe(200);
    expect(mocks.getRefreshStatus).toHaveBeenCalledWith(
      { tickers: [""] },
      expect.any(String),
    );
  });

  it("preserves safe application errors when reading refresh status", async () => {
    mocks.getRefreshStatus.mockRejectedValue(
      new ApplicationError("Ticker inválido.", 400),
    );
    const response = await GET(
      new Request("http://test/api/analyses/companies/compare?tickers=bad"),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({
      message: "Ticker inválido.",
    });
  });

  it("keeps unexpected status-read errors client-safe", async () => {
    mocks.getRefreshStatus.mockRejectedValue("private status error");
    const response = await GET(
      new Request("http://test/api/analyses/companies/compare?tickers=PETR3"),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      message: "Não foi possível consultar o status da comparação agora.",
    });
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "stock_comparison_status_failed",
      expect.objectContaining({ errorType: "string" }),
    );
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
vi.mock("@/backend/services/privacy-center.service", () => ({
  privacyCenterService: { hasAcceptedCurrentTerms: vi.fn(async () => true) },
}));
