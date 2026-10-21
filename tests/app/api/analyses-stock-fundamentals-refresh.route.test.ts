vi.mock("@/infrastructure/auth/authorization", () => ({
  getAuthenticatedUser: vi.fn(async () => ({ id: "owner-1", role: "ADMIN" })),
  isLegacyPortfolioOwner: vi.fn(async () => true),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const controller = vi.hoisted(() => ({ requestFundamentalsRefresh: vi.fn() }));
const afterMock = vi.hoisted(() => vi.fn());
const logger = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  withContext: (_context: unknown, operation: () => unknown) => operation(),
}));
vi.mock("next/server", () => ({ after: afterMock }));
vi.mock("@/backend/controllers/stock-analysis.controller", () => ({
  stockAnalysisController: controller,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { POST } from "@/app/api/analyses/stocks/[ticker]/fundamentals/refresh/route";

describe("stock fundamentals refresh route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns quickly and schedules only the claimed background refresh", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    controller.requestFundamentalsRefresh.mockResolvedValue({
      state: { status: "running", retryAfter: null, errorCode: null },
      run,
    });

    const response = await POST(new Request("http://test"), {
      params: Promise.resolve({ ticker: "PETR4" }),
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      state: { status: "running" },
    });
    expect(afterMock).toHaveBeenCalledWith(run);
    expect(controller.requestFundamentalsRefresh).toHaveBeenCalledWith(
      "PETR4",
      expect.any(String),
    );
  });

  it("returns an idempotent response when another worker owns the lease", async () => {
    controller.requestFundamentalsRefresh.mockResolvedValue({
      state: { status: "running", retryAfter: null, errorCode: null },
      run: null,
    });

    const response = await POST(new Request("http://test"), {
      params: Promise.resolve({ ticker: "PETR4" }),
    });

    expect(response.status).toBe(200);
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("keeps an unexpected setup failure client-safe", async () => {
    controller.requestFundamentalsRefresh.mockRejectedValue(
      new Error("private provider detail"),
    );

    const response = await POST(new Request("http://test"), {
      params: Promise.resolve({ ticker: "PETR4" }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      message: "Não foi possível iniciar a atualização dos fundamentos.",
    });
  });

  it("handles non-Error setup failures without exposing their values", async () => {
    controller.requestFundamentalsRefresh.mockRejectedValue(
      "private provider detail",
    );

    const response = await POST(new Request("http://test"), {
      params: Promise.resolve({ ticker: "PETR4" }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      message: "Não foi possível iniciar a atualização dos fundamentos.",
    });
  });

  it("preserves safe validation errors from the controller", async () => {
    controller.requestFundamentalsRefresh.mockRejectedValue(
      new ApplicationError("Ticker inválido.", 400),
    );

    const response = await POST(new Request("http://test"), {
      params: Promise.resolve({ ticker: "bad" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      message: "Ticker inválido.",
    });
  });
});
vi.mock("@/backend/services/privacy-center.service", () => ({
  privacyCenterService: { hasAcceptedCurrentTerms: vi.fn(async () => true) },
}));
