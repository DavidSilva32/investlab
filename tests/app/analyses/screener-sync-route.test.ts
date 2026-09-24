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
  screenerSyncRouteInternals,
} from "@/app/api/screener/sync/route";

const request = (authorization?: string) =>
  new Request("http://localhost/api/screener/sync", {
    method: "POST",
    headers: {
      ...(authorization ? { authorization } : {}),
      "x-request-id": "sync-request",
    },
  });

describe("POST /api/screener/sync", () => {
  beforeEach(() => {
    mocks.sync.mockReset();
    mocks.error.mockReset();
    vi.stubEnv("SCREENER_SYNC_SECRET", "expected-secret");
  });

  it("disables sync when no secret is configured", async () => {
    vi.stubEnv("SCREENER_SYNC_SECRET", "");
    const response = await POST(request("Bearer expected-secret"));
    expect(response.status).toBe(503);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it.each([undefined, "Basic expected-secret", "Bearer wrong"] as const)(
    "rejects invalid authorization without calling the service",
    async (authorization) => {
      const response = await POST(request(authorization));
      expect(response.status).toBe(401);
      expect(mocks.sync).not.toHaveBeenCalled();
    },
  );

  it("delegates a valid bearer secret and never logs it", async () => {
    mocks.sync.mockResolvedValue({ issuers: 2, securities: 3, facts: 15 });
    const response = await POST(request("Bearer expected-secret"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      issuers: 2,
      securities: 3,
      facts: 15,
      requestId: "sync-request",
    });
    expect(mocks.sync).toHaveBeenCalledOnce();
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain(
      "expected-secret",
    );
  });

  it("returns safe application errors and sanitizes unexpected failures", async () => {
    mocks.sync.mockRejectedValueOnce(
      new ApplicationError("A cota BRAPI terminou.", 429),
    );
    const expected = await POST(request("Bearer expected-secret"));
    expect(expected.status).toBe(429);
    await expect(expected.json()).resolves.toMatchObject({
      message: "A cota BRAPI terminou.",
    });

    mocks.sync.mockRejectedValueOnce(new Error("secret provider detail"));
    const response = await POST(request("Bearer expected-secret"));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      message: "A sincronização do screener não foi concluída.",
    });
    expect(mocks.error).toHaveBeenCalledWith("screener_sync_route_failed", {
      requestId: "sync-request",
      errorType: "Error",
    });
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain(
      "secret provider detail",
    );
  });

  it("creates a request id and sanitizes non-Error failures", async () => {
    mocks.sync.mockRejectedValue("provider failure");
    const response = await POST(
      new Request("http://localhost/api/screener/sync", {
        method: "POST",
        headers: { authorization: "Bearer expected-secret" },
      }),
    );
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body.message).toBe("A sincronização do screener não foi concluída.");
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(mocks.error).toHaveBeenCalledWith("screener_sync_route_failed", {
      requestId: body.requestId,
      errorType: "unknown",
    });
  });

  it("compares bearer secrets only when both inputs exist and lengths match", () => {
    expect(screenerSyncRouteInternals.hasValidSyncSecret(null, "secret")).toBe(
      false,
    );
    expect(
      screenerSyncRouteInternals.hasValidSyncSecret("secret", undefined),
    ).toBe(false);
    expect(
      screenerSyncRouteInternals.hasValidSyncSecret("short", "secret"),
    ).toBe(false);
    expect(
      screenerSyncRouteInternals.hasValidSyncSecret("secret", "secret"),
    ).toBe(true);
  });
});
