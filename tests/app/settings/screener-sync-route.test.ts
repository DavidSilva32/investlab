import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";
const mocks = vi.hoisted(() => ({ sync: vi.fn(), error: vi.fn() }));
vi.mock("@/backend/controllers/screener-sync.controller", () => ({
  screenerSyncController: { sync: mocks.sync },
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger: { error: mocks.error },
}));
import {
  POST,
  screenerSessionSyncRouteInternals,
} from "@/app/api/settings/screener/sync/route";
const request = (origin?: string) =>
  new Request("http://localhost/api/settings/screener/sync", {
    method: "POST",
    headers: { ...(origin ? { origin } : {}), "x-request-id": "manual-sync" },
  });

describe("POST /api/settings/screener/sync", () => {
  beforeEach(() => {
    mocks.sync.mockReset();
    mocks.error.mockReset();
  });

  it("requires an exact same-origin browser request", async () => {
    expect(
      screenerSessionSyncRouteInternals.isSameOrigin(
        request("http://localhost"),
      ),
    ).toBe(true);
    expect(
      screenerSessionSyncRouteInternals.isSameOrigin(
        request("https://attacker.test"),
      ),
    ).toBe(false);
    expect(screenerSessionSyncRouteInternals.isSameOrigin(request())).toBe(
      false,
    );
    expect(
      screenerSessionSyncRouteInternals.isSameOrigin(
        new Request("http://localhost", {
          method: "POST",
          headers: { origin: "invalid" },
        }),
      ),
    ).toBe(false);
    const response = await POST(request("https://attacker.test"));
    expect(response.status).toBe(403);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("delegates an authenticated same-origin request without a secret", async () => {
    mocks.sync.mockResolvedValue({ issuers: 12, securities: 18, facts: 24 });
    const response = await POST(request("http://localhost"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      issuers: 12,
      securities: 18,
      facts: 24,
      requestId: "manual-sync",
    });
    expect(mocks.sync).toHaveBeenCalledOnce();
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain(
      "SCREENER_SYNC_SECRET",
    );
  });

  it("creates a request id when omitted and hides non-Error failures", async () => {
    mocks.sync.mockResolvedValue({ issuers: 0, securities: 0, facts: 0 });
    const successful = await POST(
      new Request("http://localhost/api/settings/screener/sync", {
        method: "POST",
        headers: { origin: "http://localhost" },
      }),
    );
    expect(successful.status).toBe(200);
    expect((await successful.json()).requestId).toMatch(/^[0-9a-f-]{36}$/i);
    mocks.sync.mockRejectedValue("provider private detail");
    const failed = await POST(request("http://localhost"));
    expect(failed.status).toBe(502);
    expect(mocks.error).toHaveBeenCalledWith(
      "screener_sync_session_route_failed",
      {
        requestId: "manual-sync",
        errorType: "unknown",
      },
    );
  });
  it("returns safe application failures and hides unexpected details", async () => {
    mocks.sync.mockRejectedValueOnce(
      new ApplicationError("A fonte de dados limitou as consultas.", 429),
    );
    const expected = await POST(request("http://localhost"));
    expect(expected.status).toBe(429);
    await expect(expected.json()).resolves.toMatchObject({
      message: "A fonte de dados limitou as consultas.",
    });
    mocks.sync.mockRejectedValueOnce(new Error("provider secret payload"));
    const failed = await POST(request("http://localhost"));
    expect(failed.status).toBe(502);
    const body = await failed.json();
    expect(body.message).toBe("A sincronização do Screener não foi concluída.");
    expect(body.message).not.toContain("provider secret payload");
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain(
      "provider secret payload",
    );
    expect(mocks.error).toHaveBeenCalledWith(
      "screener_sync_session_route_failed",
      {
        requestId: "manual-sync",
        errorType: "Error",
      },
    );
  });
});
