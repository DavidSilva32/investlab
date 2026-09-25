import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ status: vi.fn(), error: vi.fn() }));
vi.mock("@/backend/controllers/screener-market.controller", () => ({
  screenerMarketController: { status: mocks.status },
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger: { error: mocks.error },
}));
import { GET } from "@/app/api/settings/market-data/route";

describe("GET /api/settings/market-data", () => {
  beforeEach(() => {
    mocks.status.mockReset();
    mocks.error.mockReset();
  });
  it("returns separate quote and refresh timestamps without caching", async () => {
    mocks.status.mockResolvedValue({ latestQuote: null, latestRun: null });
    const response = await GET(
      new Request("http://localhost/api/settings/market-data", {
        headers: { "x-request-id": "market-id" },
      }),
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      latestQuote: null,
      latestRun: null,
      requestId: "market-id",
    });
  });
  it("returns a generic error for a failed lookup", async () => {
    mocks.status.mockRejectedValue(new Error("private detail"));
    const response = await GET(
      new Request("http://localhost/api/settings/market-data"),
    );
    expect(response.status).toBe(500);
    expect((await response.json()).message).toBe(
      "Não foi possível consultar o estado dos dados de mercado.",
    );
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain(
      "private detail",
    );
  });
  it("logs unknown values without exposing their contents", async () => {
    mocks.status.mockRejectedValue("private non-error value");
    const response = await GET(
      new Request("http://localhost/api/settings/market-data"),
    );
    expect(response.status).toBe(500);
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain(
      "private non-error value",
    );
  });
});
