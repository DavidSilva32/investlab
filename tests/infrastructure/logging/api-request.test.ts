import { afterEach, describe, expect, it, vi } from "vitest";
const authorization = vi.hoisted(() => ({
  user: {
    id: "owner-1",
    role: "ADMIN",
    betaExpiresAt: null as Date | null,
  } as { id: string; role: string; betaExpiresAt: Date | null } | null,
}));
const support = vi.hoisted(() => ({
  token: null as string | null,
  active: null as { targetUserId: string } | null,
}));
const terms = vi.hoisted(() => ({
  hasAcceptedCurrentTerms: vi.fn(async () => true),
}));
const billing = vi.hoisted(() => ({
  hasPaidAccess: vi.fn(async () => false),
}));
vi.mock("@/infrastructure/auth/authorization", () => ({
  getAuthenticatedUser: vi.fn(async () => authorization.user),
}));
vi.mock("@/backend/services/admin-support-view.service", () => ({
  ADMIN_SUPPORT_VIEW_COOKIE: "investlab-support-view",
  hasAdminSupportViewCookie: vi.fn(() => support.token !== null),
  readAdminSupportViewToken: vi.fn(() => support.token),
  adminSupportViewService: {
    getActive: vi.fn(
      async (_token: string | null, _actorId: string) => support.active,
    ),
  },
}));
vi.mock("@/backend/services/privacy-center.service", () => ({
  privacyCenterService: terms,
}));
vi.mock("@/backend/services/billing.service", () => ({
  billingService: billing,
}));
import { getDataOwnerId } from "@/infrastructure/auth/data-owner-context";
import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";

describe("withApiRequestLogging", () => {
  afterEach(() => {
    authorization.user = { id: "owner-1", role: "ADMIN", betaExpiresAt: null };
    support.token = null;
    support.active = null;
    terms.hasAcceptedCurrentTerms.mockReset().mockResolvedValue(true);
    billing.hasPaidAccess.mockReset().mockResolvedValue(false);
    vi.restoreAllMocks();
  });

  it("logs a successful request, propagates its ID, and sets the response header", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const handler = withApiRequestLogging(
      "GET",
      "/api/analyses/stocks/[ticker]",
      async (request: Request) => {
        expect(request.headers.get("x-request-id")).toBe("trace-123");
        return Response.json({ ok: true });
      },
    );

    const response = await handler(
      new Request("https://investlab.test/api/analyses/stocks/BBDC4", {
        headers: { "x-request-id": "trace-123" },
      }),
    );
    const logs = info.mock.calls.map(([line]) => JSON.parse(line));

    expect(response.headers.get("x-request-id")).toBe("trace-123");
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "api_request_started",
          requestId: "trace-123",
          method: "GET",
          route: "/api/analyses/stocks/[ticker]",
        }),
        expect.objectContaining({
          event: "api_request_completed",
          requestId: "trace-123",
          module: "analyses",
          status: 200,
        }),
      ]),
    );
  });

  it("blocks private APIs until the authenticated user accepts current Terms", async () => {
    terms.hasAcceptedCurrentTerms.mockResolvedValueOnce(false);
    const endpoint = vi.fn(async (_request: Request) =>
      Response.json({ private: true }),
    );
    const handler = withApiRequestLogging("GET", "/api/portfolio", endpoint);

    const response = await handler(
      new Request("https://investlab.test/api/portfolio"),
    );

    expect(response.status).toBe(428);
    await expect(response.json()).resolves.toMatchObject({
      code: "TERMS_ACCEPTANCE_REQUIRED",
    });
    expect(endpoint).not.toHaveBeenCalled();
    expect(terms.hasAcceptedCurrentTerms).toHaveBeenCalledWith("owner-1");
  });

  it("replaces malformed request IDs and passes the generated ID downstream", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const handler = withApiRequestLogging(
      "POST",
      "/api/imports/preview",
      async (request: Request) => {
        expect(getApiRequestId(request)).toMatch(/^[0-9a-f-]{36}$/i);
        return Response.json({ ok: true });
      },
    );
    const response = await handler(
      new Request("https://investlab.test/api/imports/preview", {
        method: "POST",
        headers: { "x-request-id": "invalid trace" },
        body: "{}",
      }),
    );

    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("logs thrown failures and rethrows them without logging request data", async () => {
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const handler = withApiRequestLogging("GET", "", async () => {
      throw new TypeError("private detail");
    });

    await expect(handler()).rejects.toThrow("private detail");
    const logged = JSON.parse(errorLog.mock.calls[0][0]);
    expect(logged).toMatchObject({
      event: "api_request_failed",
      module: "unknown",
      errorType: "TypeError",
    });
    expect(logged).not.toHaveProperty("error");
  });

  it("logs non-Error rejections and supports handlers without a request argument", async () => {
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const handler = withApiRequestLogging(
      "POST",
      "/api/auth/logout",
      async () => {
        throw "failed";
      },
    );

    await expect(handler()).rejects.toBe("failed");
    expect(JSON.parse(errorLog.mock.calls[0][0])).toMatchObject({
      event: "api_request_failed",
      errorType: "UnknownError",
    });
  });

  it("uses an unknown module label for a successful route without a prefix", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const handler = withApiRequestLogging("GET", "", async () =>
      Response.json({ ok: true }),
    );

    await handler();

    expect(JSON.parse(info.mock.calls[1][0])).toMatchObject({
      event: "api_request_completed",
      module: "unknown",
    });
  });

  it("allows each authenticated account and scopes its private request context", async () => {
    authorization.user = { id: "new-user", role: "ADMIN", betaExpiresAt: null };
    const handler = withApiRequestLogging(
      "GET",
      "/api/portfolio",
      async (_request: Request) => Response.json({ ownerId: getDataOwnerId() }),
    );
    const response = await handler(
      new Request("https://investlab.test/api/portfolio"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ownerId: "new-user" });
  });

  it("scopes stock-analysis manual valuation inputs to the authenticated owner", async () => {
    const handler = withApiRequestLogging(
      "GET",
      "/api/analyses/stocks/[ticker]/manual-inputs",
      async (_request: Request) => Response.json({ ownerId: getDataOwnerId() }),
    );
    const response = await handler(
      new Request(
        "https://investlab.test/api/analyses/stocks/ITUB4/manual-inputs",
      ),
    );
    await expect(response.json()).resolves.toEqual({ ownerId: "owner-1" });
  });

  it("permits support-mode reads of owner inputs and denies writes", async () => {
    support.token = "a".repeat(43);
    support.active = { targetUserId: "customer-1" };
    const read = withApiRequestLogging(
      "GET",
      "/api/analyses/stocks/[ticker]/manual-inputs",
      async (_request: Request) => Response.json({ ownerId: getDataOwnerId() }),
    );
    const readResponse = await read(
      new Request(
        "https://investlab.test/api/analyses/stocks/ITUB4/manual-inputs",
        {
          headers: { cookie: "investlab-support-view=token" },
        },
      ),
    );
    await expect(readResponse.json()).resolves.toEqual({
      ownerId: "customer-1",
    });

    const write = withApiRequestLogging(
      "PUT",
      "/api/analyses/stocks/[ticker]/manual-inputs/[inputKey]",
      async (_request: Request) => Response.json({ saved: true }),
    );
    const writeResponse = await write(
      new Request(
        "https://investlab.test/api/analyses/stocks/ITUB4/manual-inputs/graham_eps",
        {
          method: "PUT",
          headers: { cookie: "investlab-support-view=token" },
        },
      ),
    );
    expect(writeResponse.status).toBe(403);
  });

  it("rejects private requests without a session before invoking the handler", async () => {
    authorization.user = null;
    const routeHandler = vi.fn(async (_request: Request) =>
      Response.json({ private: true }),
    );
    const handler = withApiRequestLogging(
      "GET",
      "/api/portfolio",
      routeHandler,
    );

    const response = await handler(
      new Request("https://investlab.test/api/portfolio"),
    );

    expect(response.status).toBe(401);
    expect(routeHandler).not.toHaveBeenCalled();
  });

  it("requires ADMIN for global administrative writes", async () => {
    authorization.user = { id: "user-1", role: "USER", betaExpiresAt: null };
    const handler = withApiRequestLogging(
      "POST",
      "/api/settings/screener/sync",
      async (_request: Request) => Response.json({ ok: true }),
    );
    const response = await handler(
      new Request("https://investlab.test/api/settings/screener/sync", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(403);
  });

  it("keeps expired beta accounts read-only while preserving supported reads", async () => {
    authorization.user = {
      id: "owner-1",
      role: "USER",
      betaExpiresAt: new Date(0),
    };
    const writeHandler = vi.fn(async (_request: Request) =>
      Response.json({ saved: true }),
    );
    const write = withApiRequestLogging(
      "POST",
      "/api/positions/manual",
      writeHandler,
    );
    const writeResponse = await write(
      new Request("https://investlab.test/api/positions/manual", {
        method: "POST",
      }),
    );
    expect(writeResponse.status).toBe(403);
    await expect(writeResponse.json()).resolves.toMatchObject({
      code: "BETA_ACCESS_EXPIRED",
    });
    expect(writeHandler).not.toHaveBeenCalled();
    expect(billing.hasPaidAccess).toHaveBeenCalledWith("owner-1");

    const readHandler = vi.fn(async (_request: Request) =>
      Response.json({ items: [] }),
    );
    const read = withApiRequestLogging("GET", "/api/portfolio", readHandler);
    const readResponse = await read(
      new Request("https://investlab.test/api/portfolio"),
    );
    expect(readResponse.status).toBe(200);
    expect(readHandler).toHaveBeenCalledOnce();
    expect(billing.hasPaidAccess).toHaveBeenCalledTimes(1);

    const analysis = withApiRequestLogging(
      "POST",
      "/api/portfolio/contribution",
      async (_request: Request) => Response.json({ result: 1 }),
    );
    expect(
      (
        await analysis(
          new Request("https://investlab.test/api/portfolio/contribution", {
            method: "POST",
          }),
        )
      ).status,
    ).toBe(200);
  });

  it("allows writes for an expired beta account with active paid access", async () => {
    authorization.user = {
      id: "paid-owner",
      role: "USER",
      betaExpiresAt: new Date(0),
    };
    billing.hasPaidAccess.mockResolvedValue(true);
    const handler = withApiRequestLogging(
      "POST",
      "/api/positions/manual",
      async (_request: Request) => Response.json({ saved: true }),
    );

    const response = await handler(
      new Request("https://investlab.test/api/positions/manual", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(billing.hasPaidAccess).toHaveBeenCalledWith("paid-owner");
  });

  it("does not apply beta expiration to administrator writes", async () => {
    authorization.user = {
      id: "admin-1",
      role: "ADMIN",
      betaExpiresAt: new Date(0),
    };
    const handler = withApiRequestLogging(
      "POST",
      "/api/portfolio/objectives",
      async (_request: Request) => Response.json({ saved: true }),
    );
    const response = await handler(
      new Request("https://investlab.test/api/portfolio/objectives", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(200);
  });

  it("allows the authenticated admin to manage the support-view cookie and logout", async () => {
    support.token = "a".repeat(43);
    support.active = { targetUserId: "customer-1" };
    const control = withApiRequestLogging(
      "GET",
      "/api/admin/support-view",
      async (_request: Request) => Response.json({ ownerId: getDataOwnerId() }),
    );
    const controlResponse = await control(
      new Request("https://investlab.test/api/admin/support-view"),
    );
    expect(controlResponse.status).toBe(200);
    expect(await controlResponse.json()).toEqual({ ownerId: "owner-1" });

    const logout = withApiRequestLogging(
      "POST",
      "/api/auth/logout",
      async (_request: Request) => Response.json({ loggedOut: true }),
    );
    const logoutResponse = await logout(
      new Request("https://investlab.test/api/auth/logout", {
        method: "POST",
      }),
    );
    expect(logoutResponse.status).toBe(200);
    expect(await logoutResponse.json()).toEqual({ loggedOut: true });
  });

  it("allows an explicitly read-only global screener endpoint without customer ownership", async () => {
    support.token = "a".repeat(43);
    support.active = { targetUserId: "customer-1" };
    const handler = withApiRequestLogging(
      "GET",
      "/api/screener",
      async (_request: Request) => Response.json({ ownerId: getDataOwnerId() }),
    );

    const response = await handler(
      new Request("https://investlab.test/api/screener"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ownerId: null });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("uses only the active server-side target for scoped customer reads", async () => {
    support.token = "a".repeat(43);
    support.active = { targetUserId: "customer-1" };
    const handler = withApiRequestLogging(
      "GET",
      "/api/portfolio",
      async (_request: Request) => Response.json({ ownerId: getDataOwnerId() }),
    );

    const response = await handler(
      new Request(
        "https://investlab.test/api/portfolio?targetUserId=customer-2",
        {
          headers: { "x-investlab-target-user": "customer-3" },
        },
      ),
    );

    expect(await response.json()).toEqual({ ownerId: "customer-1" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    ["GET", "/api/admin/users"],
    ["GET", "/api/settings/market-data"],
    ["GET", "/api/auth/session"],
    ["GET", "/api/cron/weekly-screener-sync/[task]"],
    ["POST", "/api/portfolio/operations"],
    ["POST", "/api/imports/preview"],
    ["POST", "/api/imports/confirm"],
    ["GET", "/api/portfolio/not-a-real-route"],
  ])("fails closed for %s %s during support mode", async (method, route) => {
    support.token = "a".repeat(43);
    support.active = { targetUserId: "customer-1" };
    const handler = withApiRequestLogging(
      method,
      route,
      vi.fn(async (_request: Request) => Response.json({ leaked: true })),
    );

    const response = await handler(
      new Request(`https://investlab.test${route}`, { method }),
    );

    expect(response.status).toBe(403);
  });

  it("blocks customer mutations and the scheduled sync during support mode", async () => {
    support.token = "a".repeat(43);
    support.active = { targetUserId: "customer-1" };
    const handler = withApiRequestLogging(
      "POST",
      "/api/portfolio/operations",
      async (_request: Request) => Response.json({ saved: true }),
    );
    const response = await handler(
      new Request("https://investlab.test/api/portfolio/operations", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      message:
        "Esta operação não está disponível durante a visualização de suporte.",
    });

    const cron = withApiRequestLogging(
      "GET",
      "/api/cron/weekly-screener-sync/[task]",
      async (_request: Request) => Response.json({ synced: true }),
    );
    expect(
      (
        await cron(
          new Request(
            "https://investlab.test/api/cron/weekly-screener-sync/market",
          ),
        )
      ).status,
    ).toBe(403);
  });

  it("scopes each allowlisted owner API to the selected customer", async () => {
    support.token = "a".repeat(43);
    support.active = { targetUserId: "customer-1" };
    const routes = [
      "/api/portfolio",
      "/api/portfolio/monthly-review",
      "/api/portfolio/operations",
      "/api/portfolio/strategy",
      "/api/portfolio/allocation",
      "/api/portfolio/objectives",
      "/api/positions/manual",
      "/api/positions/reconciliation",
      "/api/emergency-reserve",
      "/api/analyses/portfolio-opportunities",
      "/api/learning/progress",
    ];

    for (const route of routes) {
      const handler = withApiRequestLogging(
        "GET",
        route,
        async (_request: Request) =>
          Response.json({ ownerId: getDataOwnerId() }),
      );
      const response = await handler(
        new Request(`https://investlab.test${route}?targetUserId=attacker`),
      );
      expect(response.status, route).toBe(200);
      expect(await response.json(), route).toEqual({ ownerId: "customer-1" });
    }
  });

  it("rejects a malformed or copied support token bound to another actor", async () => {
    support.token = "malformed.token";
    support.active = null;
    const handler = withApiRequestLogging(
      "GET",
      "/api/portfolio",
      vi.fn(async (_request: Request) => Response.json({ private: true })),
    );
    const response = await handler(
      new Request("https://investlab.test/api/portfolio"),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("clears invalid support cookies when the administrator session is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    support.token = "a".repeat(43);
    authorization.user = null;
    const handler = withApiRequestLogging(
      "GET",
      "/api/portfolio",
      vi.fn(async (_request: Request) => Response.json({ private: true })),
    );
    const response = await handler(
      new Request("https://investlab.test/api/portfolio"),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("permits audited read-only calculations against the customer data", async () => {
    support.token = "a".repeat(43);
    support.active = { targetUserId: "customer-1" };
    const handler = withApiRequestLogging(
      "POST",
      "/api/portfolio/contribution",
      async (_request: Request) => Response.json({ ownerId: getDataOwnerId() }),
    );

    const response = await handler(
      new Request("https://investlab.test/api/portfolio/contribution", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ownerId: "customer-1" });
  });

  it("fails closed when the server-side support context expired", async () => {
    support.token = "a".repeat(43);
    support.active = null;
    const handler = withApiRequestLogging(
      "GET",
      "/api/portfolio",
      vi.fn(async (_request: Request) => Response.json({ private: true })),
    );

    const response = await handler(
      new Request("https://investlab.test/api/portfolio"),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("does not activate support mode for a non-administrator", async () => {
    authorization.user = { id: "user-1", role: "USER", betaExpiresAt: null };
    support.token = "a".repeat(43);
    support.active = { targetUserId: "customer-1" };
    const handler = withApiRequestLogging(
      "GET",
      "/api/portfolio",
      vi.fn(async (_request: Request) => Response.json({ private: true })),
    );

    const response = await handler(
      new Request("https://investlab.test/api/portfolio"),
    );
    expect(response.status).toBe(403);
  });
});
