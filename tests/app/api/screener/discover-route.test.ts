import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ discover: vi.fn(), error: vi.fn() }));
vi.mock("@/backend/controllers/screener.controller", () => ({
  screenerController: { discover: mocks.discover },
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger: { error: mocks.error },
}));
import { GET } from "@/app/api/screener/discover/route";

describe("GET /api/screener/discover", () => {
  beforeEach(() => {
    mocks.discover.mockReset();
    mocks.error.mockReset();
  });
  it("returns the discovery result and request id", async () => {
    mocks.discover.mockResolvedValue(
      Response.json({ results: [], hasSuccessfulSync: true, requestId: "id" }),
    );
    const response = await GET(
      new Request("http://localhost/api/screener/discover", {
        headers: { "x-request-id": "id" },
      }),
    );
    expect(await response.json()).toEqual({
      results: [],
      hasSuccessfulSync: true,
      requestId: "id",
    });
  });
  it("returns a generic error and logs only the error type", async () => {
    mocks.discover.mockRejectedValue(new Error("private detail"));
    const response = await GET(
      new Request("http://localhost/api/screener/discover"),
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      message: "Não foi possível carregar empresas para estudo agora.",
    });
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain(
      "private detail",
    );
  });
  it("logs unknown values without exposing their contents", async () => {
    mocks.discover.mockRejectedValue("private non-error value");
    const response = await GET(
      new Request("http://localhost/api/screener/discover"),
    );
    expect(response.status).toBe(502);
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain(
      "private non-error value",
    );
  });
});
