vi.mock("@/backend/services/privacy-center.service", () => ({
  privacyCenterService: { hasAcceptedCurrentTerms: vi.fn(async () => true) },
}));

vi.mock("@/infrastructure/auth/authorization", () => ({
  getAuthenticatedUser: vi.fn(async () => ({ id: "owner-1", role: "ADMIN" })),
  isLegacyPortfolioOwner: vi.fn(async () => true),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), error: vi.fn() }));
vi.mock("@/backend/controllers/screener-market.controller", () => ({
  screenerMarketController: { refresh: mocks.refresh },
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger: {
    error: mocks.error,
    info: vi.fn(),
    withContext: (_context: unknown, operation: () => unknown) => operation(),
  },
}));
import { POST } from "@/app/api/screener/market/refresh/route";
import { isSameOrigin } from "@/lib/http/is-same-origin";

const request = (origin?: string) =>
  new Request("http://localhost/api/screener/market/refresh", {
    method: "POST",
    headers: {
      ...(origin ? { origin } : {}),
      "x-request-id": "market-refresh",
    },
  });

describe("POST /api/screener/market/refresh", () => {
  beforeEach(() => {
    mocks.refresh.mockReset();
    mocks.error.mockReset();
  });

  it("accepts only a same-origin browser request", async () => {
    expect(isSameOrigin(request("http://localhost"))).toBe(true);
    expect(isSameOrigin(request("https://attacker.test"))).toBe(false);
    expect(isSameOrigin(request())).toBe(false);
    const malformed = new Request("http://localhost", {
      method: "POST",
      headers: { origin: "invalid" },
    });
    expect(isSameOrigin(malformed)).toBe(false);
    const response = await POST(request("https://attacker.test"));
    expect(response.status).toBe(403);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("delegates the market refresh batch and includes the request id", async () => {
    mocks.refresh.mockResolvedValue({
      attemptedIssuers: 20,
      remainingIssuers: 2,
    });
    const response = await POST(request("http://localhost"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      attemptedIssuers: 20,
      remainingIssuers: 2,
      requestId: "market-refresh",
    });
    expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith("market-refresh");
  });

  it("uses a request id when absent and returns safe failure messages", async () => {
    mocks.refresh.mockResolvedValueOnce({ remainingIssuers: 0 });
    const response = await POST(
      new Request("http://localhost/api/screener/market/refresh", {
        method: "POST",
        headers: { origin: "http://localhost" },
      }),
    );
    expect((await response.json()).requestId).toMatch(/^[0-9a-f-]{36}$/i);

    mocks.refresh.mockRejectedValueOnce(
      new ApplicationError("BRAPI limitada.", 429),
    );
    expect((await POST(request("http://localhost"))).status).toBe(429);
    mocks.refresh.mockRejectedValueOnce(new Error("private provider payload"));
    const failed = await POST(request("http://localhost"));
    expect(failed.status).toBe(502);
    const payload = await failed.json();
    expect(payload.message).toBe(
      "Não foi possível atualizar os dados de mercado agora.",
    );
    expect(payload.message).not.toContain("private provider payload");
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain(
      "private provider payload",
    );
    mocks.refresh.mockRejectedValueOnce("private payload");
    const unknown = await POST(request("http://localhost"));
    expect(unknown.status).toBe(502);
    expect(mocks.error).toHaveBeenLastCalledWith(
      "screener_market_refresh_route_failed",
      { requestId: "market-refresh", errorType: "unknown" },
    );
  });
});
