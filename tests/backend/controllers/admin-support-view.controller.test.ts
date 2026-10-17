import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const mocks = vi.hoisted(() => ({
  service: {
    listTargets: vi.fn(),
    start: vi.fn(),
    getActive: vi.fn(),
  },
  requireRole: vi.fn(),
}));
vi.mock("@/backend/services/admin-support-view.service", () => ({
  ADMIN_SUPPORT_VIEW_COOKIE: "investlab-support-view",
  ADMIN_SUPPORT_VIEW_DURATION_MS: 1_800_000,
  readAdminSupportViewToken: vi.fn((headers?: Headers) => {
    const value = headers
      ?.get("cookie")
      ?.match(/investlab-support-view=([^;]+)/)?.[1];
    return value && /^[A-Za-z0-9_.-]{20,512}$/.test(value) ? value : null;
  }),
  adminSupportViewService: mocks.service,
}));
vi.mock("@/infrastructure/auth/authorization", () => ({
  requireRole: mocks.requireRole,
}));

import { AdminSupportViewController } from "@/backend/controllers/admin-support-view.controller";

describe("AdminSupportViewController", () => {
  const controller = new AdminSupportViewController();
  const admin = { id: "admin-1", role: "ADMIN" };
  const target = { id: "customer-1", name: "Marcos", email: "m@example.com" };
  const sameOriginHeaders = {
    origin: "https://investlab.test",
    "content-type": "application/json",
  };
  const request = (
    path: string,
    method: string,
    body?: unknown,
    headers: HeadersInit = sameOriginHeaders,
  ) =>
    new Request(`https://investlab.test${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.requireRole.mockResolvedValue(admin);
    mocks.service.listTargets.mockResolvedValue([target]);
    mocks.service.getActive.mockResolvedValue(null);
  });

  it("returns customer accounts and the current support target without cache", async () => {
    const expiresAt = new Date("2026-10-16T14:00:00Z");
    mocks.service.getActive.mockResolvedValue({
      targetUserId: target.id,
      targetName: target.name,
      targetEmail: target.email,
      expiresAt,
    });
    const response = await controller.get(
      request("/api/admin/support-view", "GET", undefined, {
        cookie: `investlab-support-view=${"a".repeat(43)}`,
      }),
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      targets: [target],
      supportView: {
        target,
        expiresAt: expiresAt.toISOString(),
      },
    });
  });

  it("returns the account list without setting a cookie when support mode is inactive", async () => {
    const response = await controller.get(
      request("/api/admin/support-view", "GET"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toEqual({
      targets: [target],
      supportView: null,
    });
  });

  it("clears an expired cookie and returns no current view", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await controller.get(
      request("/api/admin/support-view", "GET", undefined, {
        cookie: `investlab-support-view=${"b".repeat(43)}`,
      }),
    );
    expect(await response.json()).toEqual({
      targets: [target],
      supportView: null,
    });
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("starts a same-origin session and sets only an HttpOnly token cookie", async () => {
    const expiresAt = new Date("2026-10-16T14:00:00Z");
    mocks.service.start.mockResolvedValue({
      token: `${"c".repeat(40)}.${"d".repeat(43)}`,
      target,
      expiresAt,
    });
    const response = await controller.start(
      request("/api/admin/support-view", "POST", { targetUserId: target.id }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toContain(
      "investlab-support-view=" + `${"c".repeat(40)}.${"d".repeat(43)}`,
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(response.headers.get("set-cookie")).not.toContain("Secure");
    expect(await response.json()).not.toHaveProperty("token");
  });

  it("marks the cookie Secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.service.start.mockResolvedValue({
      token: `${"d".repeat(40)}.${"e".repeat(43)}`,
      target,
      expiresAt: new Date("2026-10-16T14:00:00Z"),
    });
    const response = await controller.start(
      request("/api/admin/support-view", "POST", { targetUserId: target.id }),
    );
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("rejects cross-origin or malformed start requests", async () => {
    const crossOrigin = await controller.start(
      request(
        "/api/admin/support-view",
        "POST",
        { targetUserId: target.id },
        {
          ...sameOriginHeaders,
          origin: "https://attacker.test",
        },
      ),
    );
    expect(crossOrigin.status).toBe(403);
    const missingOrigin = await controller.start(
      request(
        "/api/admin/support-view",
        "POST",
        { targetUserId: target.id },
        {
          "content-type": "application/json",
        },
      ),
    );
    expect(missingOrigin.status).toBe(403);
    const malformedOrigin = await controller.start(
      request(
        "/api/admin/support-view",
        "POST",
        { targetUserId: target.id },
        {
          ...sameOriginHeaders,
          origin: "https://[invalid-host",
        },
      ),
    );
    expect(malformedOrigin.status).toBe(403);
    expect(
      (
        await controller.start(
          request("/api/admin/support-view", "POST", { targetUserId: "" }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await controller.start(
          new Request("https://investlab.test/api/admin/support-view", {
            method: "POST",
            headers: sameOriginHeaders,
            body: "{",
          }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.service.start).not.toHaveBeenCalled();
  });

  it("clears the browser cookie on stop and replaces it when switching targets", async () => {
    mocks.service.start.mockResolvedValue({
      token: `${"e".repeat(40)}.${"f".repeat(43)}`,
      target,
      expiresAt: new Date("2026-10-16T14:00:00Z"),
    });
    const switchingRequest = request(
      "/api/admin/support-view",
      "POST",
      { targetUserId: target.id },
      {
        ...sameOriginHeaders,
        cookie: `investlab-support-view=${"f".repeat(40)}.${"g".repeat(43)}`,
      },
    );
    const started = await controller.start(switchingRequest);
    expect(started.status).toBe(200);
    expect(started.headers.get("set-cookie")).toContain("Max-Age=1800");

    const response = await controller.end(
      request("/api/admin/support-view", "DELETE", undefined, {
        ...sameOriginHeaders,
        cookie: `investlab-support-view=${"e".repeat(40)}.${"f".repeat(43)}`,
      }),
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await response.json()).toEqual({ supportView: null });
  });

  it("rejects cross-origin stop requests and returns safe errors", async () => {
    const crossOrigin = await controller.end(
      request("/api/admin/support-view", "DELETE", undefined, {
        origin: "https://attacker.test",
      }),
    );
    expect(crossOrigin.status).toBe(403);
    mocks.service.listTargets.mockRejectedValueOnce(
      new ApplicationError("Denied", 403),
    );
    expect(
      (await controller.get(request("/api/admin/support-view", "GET"))).status,
    ).toBe(403);
    mocks.service.listTargets.mockRejectedValueOnce(new Error("db details"));
    const failed = await controller.get(
      request("/api/admin/support-view", "GET"),
    );
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({
      message: "Não foi possível atualizar o modo de suporte.",
    });
  });
});
