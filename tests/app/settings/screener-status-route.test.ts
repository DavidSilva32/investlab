import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ status: vi.fn(), error: vi.fn() }));
vi.mock("@/backend/controllers/screener-sync.controller", () => ({
  screenerSyncController: { status: mocks.status },
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger: { error: mocks.error },
}));
import { GET } from "@/app/api/settings/screener/route";

describe("GET /api/settings/screener", () => {
  beforeEach(() => {
    mocks.status.mockReset();
    mocks.error.mockReset();
  });

  it("returns safe synchronization history with a request id", async () => {
    mocks.status.mockResolvedValue({
      hasSuccessfulSync: true,
      latestRun: null,
    });
    const response = await GET(
      new Request("http://localhost/api/settings/screener", {
        headers: { "x-request-id": "settings-request" },
      }),
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      hasSuccessfulSync: true,
      latestRun: null,
      requestId: "settings-request",
    });
  });

  it("sanitizes non-Error status failures", async () => {
    mocks.status.mockRejectedValue("internal detail");
    const response = await GET(
      new Request("http://localhost/api/settings/screener"),
    );
    expect(response.status).toBe(500);
    expect(mocks.error).toHaveBeenCalledWith("screener_sync_status_failed", {
      requestId: expect.any(String),
      errorType: "unknown",
    });
  });
  it("logs only the failure type and returns a generic status error", async () => {
    mocks.status.mockRejectedValue(new Error("private database detail"));
    const response = await GET(
      new Request("http://localhost/api/settings/screener"),
    );
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.message).toBe(
      "Não foi possível consultar o status da sincronização.",
    );
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain(
      "private database detail",
    );
  });
});
